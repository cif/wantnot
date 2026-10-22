import { db, users, accounts } from '~/db';
import { eq } from 'drizzle-orm';
import { PlaidService, PlaidSyncError, getPlaidError } from '~/lib/plaid-service';
import { buildDigest, recordBalanceSnapshots, type SyncOutcome } from '~/lib/alerts';
import { sendEmail } from '~/lib/email';

// Daily job (see vercel.json): sync every Plaid Item, refresh balances, snapshot them,
// evaluate alert rules, and email a digest to each user.
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` when the env var is set.
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function loader({ request }: { request: Request }) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runStartedAt = new Date();
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const summary: any[] = [];

  const allUsers = await db.select().from(users);
  for (const user of allUsers) {
    const userAccounts = await PlaidService.getUserAccounts(user.id);
    if (userAccounts.length === 0) continue;

    // One sync per Item; /transactions/sync covers every account on the Item
    const outcomes: SyncOutcome[] = [];
    const seenItems = new Set<string>();
    for (const account of userAccounts) {
      if (seenItems.has(account.plaidItemId)) continue;
      seenItems.add(account.plaidItemId);
      try {
        const result = await PlaidService.syncTransactions(user.id, account.id, account.accessToken);
        outcomes.push({ accountName: account.name, ...result });
      } catch (error) {
        const plaidError = error instanceof PlaidSyncError ? error : null;
        outcomes.push({
          accountName: account.name,
          error: 'Failed to sync',
          errorCode: plaidError?.code ?? null,
          needsReconnect: plaidError?.needsReconnect ?? false,
        });
      }
    }

    // Refresh balances, one Plaid call per Item
    const balancesByItem = new Map<string, Awaited<ReturnType<typeof PlaidService.getAccountDetails>>>();
    for (const account of userAccounts) {
      try {
        if (!balancesByItem.has(account.plaidItemId)) {
          balancesByItem.set(account.plaidItemId, await PlaidService.getAccountDetails(account.accessToken));
        }
        const fresh = balancesByItem.get(account.plaidItemId)!.find((a) => a.account_id === account.plaidAccountId);
        if (fresh) {
          await db
            .update(accounts)
            .set({
              currentBalance: fresh.balances.current?.toString() || null,
              availableBalance: fresh.balances.available?.toString() || null,
              updatedAt: new Date(),
            })
            .where(eq(accounts.id, account.id));
        }
      } catch (error) {
        const { code } = getPlaidError(error);
        console.error(`[cron] balance refresh failed for ${account.id}:`, code);
        if (code === 'ITEM_LOGIN_REQUIRED' && !outcomes.some((o) => o.needsReconnect)) {
          outcomes.push({ accountName: account.name, error: 'Failed to refresh balance', errorCode: code, needsReconnect: true });
        }
      }
    }

    const digest = await buildDigest(user.id, outcomes, runStartedAt);
    if (!dryRun) await recordBalanceSnapshots(user.id);

    const to = process.env.ALERT_EMAIL_TO || user.email;
    const email = dryRun ? { sent: false, error: 'dry run' } : await sendEmail({ to, subject: digest.subject, html: digest.html, text: digest.text });

    summary.push({ userId: user.id, to, subject: digest.subject, flags: digest.flags, sync: outcomes, email, ...(dryRun ? { text: digest.text } : {}) });
  }

  return Response.json({ ok: true, ranAt: runStartedAt.toISOString(), dryRun, users: summary });
}
