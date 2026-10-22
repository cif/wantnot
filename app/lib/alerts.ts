import { db, accounts, accountBalanceSnapshots, categories, transactions } from '~/db';
import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';

// Thresholds. Category caps come from categories.budget_limit.
const LARGE_TRANSACTION = 200;
const LOW_CHECKING = 500;
const PACE_WARNING = 1.2; // flag when month-to-date spend is 20% ahead of the calendar

export interface SyncOutcome {
  accountName: string;
  error?: string;
  errorCode?: string | null;
  needsReconnect?: boolean;
  added?: number;
  modified?: number;
}

export interface Digest {
  subject: string;
  text: string;
  html: string;
  flags: string[];
}

interface CategoryLine {
  name: string;
  spent: number;
  cap: number | null;
  pct: number | null;
  over: boolean;
  ahead: boolean;
}

const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function monthBounds(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86400000);
  const elapsed = Math.min(daysInMonth, now.getUTCDate()) / daysInMonth;
  return { start, end, elapsed, label: start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

export async function recordBalanceSnapshots(userId: string) {
  const rows = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)));
  if (rows.length === 0) return;
  await db.insert(accountBalanceSnapshots).values(
    rows.map((a) => ({ accountId: a.id, currentBalance: a.currentBalance, availableBalance: a.availableBalance }))
  );
}

async function balanceAgo(accountId: string, before: Date) {
  const row = await db
    .select({ balance: accountBalanceSnapshots.currentBalance, takenAt: accountBalanceSnapshots.takenAt })
    .from(accountBalanceSnapshots)
    .where(and(eq(accountBalanceSnapshots.accountId, accountId), lte(accountBalanceSnapshots.takenAt, before)))
    .orderBy(desc(accountBalanceSnapshots.takenAt))
    .limit(1);
  return row[0] ?? null;
}

async function lastRunBefore(userId: string, before: Date): Promise<Date | null> {
  const row = await db
    .select({ takenAt: accountBalanceSnapshots.takenAt })
    .from(accountBalanceSnapshots)
    .innerJoin(accounts, eq(accounts.id, accountBalanceSnapshots.accountId))
    .where(and(eq(accounts.userId, userId), lt(accountBalanceSnapshots.takenAt, before)))
    .orderBy(desc(accountBalanceSnapshots.takenAt))
    .limit(1);
  return row[0]?.takenAt ?? null;
}

export async function buildDigest(userId: string, syncOutcomes: SyncOutcome[], runStartedAt: Date): Promise<Digest> {
  const now = new Date();
  const { start, end, elapsed, label } = monthBounds(now);
  const flags: string[] = [];

  // --- Sync health -------------------------------------------------------
  const failed = syncOutcomes.filter((o) => o.error);
  const reconnect = syncOutcomes.filter((o) => o.needsReconnect);
  if (reconnect.length > 0) {
    flags.push(`Bank connection needs to be re-authorized (${reconnect.map((o) => o.accountName).join(', ')}). Open Home and click Reconnect Bank.`);
  } else if (failed.length > 0) {
    flags.push(`Sync failed for ${failed.map((o) => `${o.accountName}${o.errorCode ? ` (${o.errorCode})` : ''}`).join(', ')}.`);
  }
  const added = syncOutcomes.reduce((n, o) => n + (o.added ?? 0), 0);

  // --- Balances ------------------------------------------------------------
  const accts = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)));
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const balanceLines: string[] = [];
  for (const a of accts) {
    const current = a.currentBalance ? parseFloat(a.currentBalance) : null;
    if (current === null) continue;
    const prior = await balanceAgo(a.id, weekAgo);
    const priorBalance = prior?.balance ? parseFloat(prior.balance) : null;
    const delta = priorBalance === null ? null : current - priorBalance;
    const deltaText = delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${money(delta)} vs ${prior!.takenAt.toISOString().slice(0, 10)})`;
    balanceLines.push(`${a.name} ${a.mask ? `…${a.mask}` : ''}: ${money(current)}${deltaText}`);
    if (a.type === 'credit' && delta !== null && delta > 0) {
      flags.push(`${a.name} balance is up ${money(delta)} over the last week.`);
    }
    if (a.subtype === 'checking') {
      const available = a.availableBalance ? parseFloat(a.availableBalance) : current;
      if (available < LOW_CHECKING) flags.push(`Checking available balance is ${money(available)}, below ${money(LOW_CHECKING)}.`);
    }
  }

  // --- Month-to-date spend vs caps --------------------------------------
  const cats = await db.select().from(categories).where(eq(categories.userId, userId));
  const spendRows = await db
    .select({ categoryId: transactions.categoryId, total: sql<string>`sum(${transactions.amount})`, count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.isHidden, false),
      eq(transactions.isTransfer, false),
      sql`${transactions.projectId} is null`,
      sql`${transactions.amount} > 0`,
      gte(transactions.date, start),
      lt(transactions.date, end),
    ))
    .groupBy(transactions.categoryId);
  const spentBy = new Map(spendRows.map((r) => [r.categoryId, parseFloat(r.total)]));
  const countBy = new Map(spendRows.map((r) => [r.categoryId, Number(r.count)]));

  const lines: CategoryLine[] = [];
  const uncategorized = spentBy.get(null) ?? 0;
  for (const c of cats) {
    if (c.isIncome) continue;
    const spent = spentBy.get(c.id) ?? 0;
    const cap = c.budgetLimit ? parseFloat(c.budgetLimit) : null;
    if (spent === 0 && cap === null) continue;
    const pct = cap ? spent / cap : null;
    const over = cap !== null && spent > cap;
    // Pace only means something for categories with many small transactions; a single
    // fixed bill (rent) is at 100% of its cap on day one and that is fine.
    const ahead = !over && cap !== null && pct !== null && (countBy.get(c.id) ?? 0) >= 3 && pct > elapsed * PACE_WARNING && pct > 0.25;
    lines.push({ name: c.name, spent, cap, pct, over, ahead });
    if (over) flags.push(`${c.name} is over its ${money(cap!)} cap: ${money(spent)} spent.`);
    else if (ahead) flags.push(`${c.name} is ahead of pace: ${money(spent)} of ${money(cap!)} with ${Math.round(elapsed * 100)}% of the month gone.`);
  }
  lines.sort((a, b) => b.spent - a.spent);
  const capped = lines.filter((l) => l.cap !== null);
  const totalSpent = capped.reduce((n, l) => n + l.spent, 0);
  const totalCap = capped.reduce((n, l) => n + (l.cap ?? 0), 0);

  // --- New large transactions since the last run ------------------------
  const since = (await lastRunBefore(userId, runStartedAt)) ?? new Date(now.getTime() - 86400000);
  const largeNew = await db
    .select({ name: transactions.name, merchantName: transactions.merchantName, amount: transactions.amount, date: transactions.date, categoryId: transactions.categoryId })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.isHidden, false),
      eq(transactions.isTransfer, false),
      sql`${transactions.projectId} is null`,
      gte(transactions.createdAt, since),
      sql`${transactions.amount} >= ${LARGE_TRANSACTION}`,
    ))
    .orderBy(desc(transactions.amount));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const label_ = (t: { merchantName: string | null; name: string }) => {
    const m = t.merchantName && t.merchantName.length >= 4 ? t.merchantName : t.name;
    return m.length > 60 ? m.slice(0, 57) + '...' : m;
  };
  const largeLines = largeNew.map((t) => `${t.date.toISOString().slice(0, 10)}  ${money(parseFloat(t.amount))}  ${label_(t)}${t.categoryId ? ` [${catName.get(t.categoryId)}]` : ' [uncategorized]'}`);
  if (largeLines.length > 0) flags.push(`${largeLines.length} new charge(s) of ${money(LARGE_TRANSACTION)} or more since the last check.`);

  const uncatCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.isHidden, false), eq(transactions.isTransfer, false), sql`${transactions.categoryId} is null`, gte(transactions.date, start)));
  const uncategorizedCount = Number(uncatCount[0]?.n ?? 0);

  // --- Compose --------------------------------------------------------------
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
  const subject = flags.length > 0
    ? `WantNot ${dateLabel}: ${flags.length} flag${flags.length === 1 ? '' : 's'}, ${label} at ${money(totalSpent)} of ${money(totalCap)}`
    : `WantNot ${dateLabel}: on track, ${label} at ${money(totalSpent)} of ${money(totalCap)}`;

  const catText = lines.map((l) => {
    const capText = l.cap === null ? '' : l.cap === 0 ? ' / $0' : ` / ${money(l.cap)} (${Math.round((l.pct ?? 0) * 100)}%)`;
    const mark = l.over ? '  OVER' : l.ahead ? '  ahead' : '';
    return `  ${l.name.padEnd(32)} ${money(l.spent).padStart(8)}${capText}${mark}`;
  });

  const text = [
    flags.length > 0 ? 'FLAGS' : 'No flags today.',
    ...flags.map((f) => `  - ${f}`),
    '',
    `${label}: ${money(totalSpent)} of ${money(totalCap)} capped spend, ${Math.round(elapsed * 100)}% of month elapsed`,
    ...catText,
    uncategorized > 0 ? `  ${'Uncategorized'.padEnd(32)} ${money(uncategorized).padStart(8)}  (${uncategorizedCount} transactions)` : '',
    '',
    'BALANCES',
    ...balanceLines.map((b) => `  ${b}`),
    '',
    largeLines.length > 0 ? 'NEW CHARGES OVER ' + money(LARGE_TRANSACTION) : '',
    ...largeLines.map((l) => `  ${l}`),
    '',
    `Sync: ${added} new transaction(s)${failed.length ? `, ${failed.length} account(s) failed` : ''}.`,
  ].filter((l) => l !== undefined).join('\n');

  const row = (cells: string[], tag = 'td') => `<tr>${cells.map((c) => `<${tag} style="padding:4px 10px 4px 0;text-align:left;font-variant-numeric:tabular-nums">${c}</${tag}>`).join('')}</tr>`;
  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#111;max-width:640px">
  ${flags.length > 0
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:16px"><strong>Flags</strong><ul style="margin:6px 0 0;padding-left:18px">${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`
    : `<div style="background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:10px 14px;margin-bottom:16px">No flags today.</div>`}
  <h3 style="margin:0 0 6px;color:#41A6AC">${esc(label)}: ${money(totalSpent)} of ${money(totalCap)}</h3>
  <div style="color:#555;margin-bottom:8px">${Math.round(elapsed * 100)}% of the month elapsed. Project-tagged and transfer transactions excluded.</div>
  <table style="border-collapse:collapse;margin-bottom:16px">
    ${row(['Category', 'Spent', 'Cap', '%'], 'th')}
    ${lines.map((l) => row([
      esc(l.name),
      money(l.spent),
      l.cap === null ? '–' : money(l.cap),
      l.pct === null || l.cap === 0 ? (l.over ? '<span style="color:#b91c1c">over</span>' : '–') : `<span style="color:${l.over ? '#b91c1c' : l.ahead ? '#b45309' : '#111'}">${Math.round(l.pct * 100)}%${l.over ? ' over' : l.ahead ? ' ahead' : ''}</span>`,
    ])).join('')}
    ${uncategorized > 0 ? row(['<em>Uncategorized</em>', money(uncategorized), `${uncategorizedCount} txns`, '']) : ''}
  </table>
  <h3 style="margin:0 0 6px;color:#41A6AC">Balances</h3>
  <ul style="margin:0 0 16px;padding-left:18px">${balanceLines.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  ${largeLines.length > 0 ? `<h3 style="margin:0 0 6px;color:#41A6AC">New charges over ${money(LARGE_TRANSACTION)}</h3><pre style="font-size:12px;margin:0 0 16px">${esc(largeLines.join('\n'))}</pre>` : ''}
  <div style="color:#777;font-size:12px">Sync: ${added} new transaction(s)${failed.length ? `, ${failed.length} account(s) failed` : ''}.</div>
</div>`;

  return { subject, text, html, flags };
}
