// Centralized formatting utilities for consistent display across the app

/**
 * Format a number as currency with proper locale formatting
 * @param amount - The amount to format (can be string or number)
 * @param options - Optional formatting options
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(
  amount: string | number,
  options: {
    locale?: string;
    currency?: string;
    showSign?: boolean; // Show + for positive numbers
    skipSymbol?: boolean; // Return just the number without $
  } = {}
): string {
  const {
    locale = 'en-US',
    currency = 'USD',
    showSign = false,
    skipSymbol = false,
  } = options;

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return skipSymbol ? '0.00' : '$0.00';
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: skipSymbol ? 'decimal' : 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(numAmount));

  if (showSign && numAmount > 0) {
    return `+${formatted}`;
  }

  if (numAmount < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

/**
 * Format a number with thousands separators
 * @param num - The number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string (e.g., "1,234.56")
 */
export function formatNumber(
  num: string | number,
  decimals: number = 0,
  locale: string = 'en-US'
): string {
  const numValue = typeof num === 'string' ? parseFloat(num) : num;

  if (isNaN(numValue)) {
    return '0';
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
}

/**
 * Format a percentage
 * @param value - The decimal value (e.g., 0.85 for 85%)
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted percentage string (e.g., "85%")
 */
export function formatPercent(
  value: number,
  decimals: number = 0,
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Format a date consistently
 * @param date - Date string or Date object
 * @param style - 'short' (1/1/23), 'medium' (Jan 1, 2023), 'long' (January 1, 2023)
 * @param useUTC - Whether to display in UTC timezone (default: true)
 * @returns Formatted date string
 */
export function formatDate(
  date: string | Date,
  style: 'short' | 'medium' | 'long' = 'medium',
  locale: string = 'en-US',
  useUTC: boolean = true
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: useUTC ? 'UTC' : undefined }
      : style === 'long'
      ? { month: 'long', day: 'numeric', year: 'numeric', timeZone: useUTC ? 'UTC' : undefined }
      : { month: 'short', day: 'numeric', year: 'numeric', timeZone: useUTC ? 'UTC' : undefined };

  return new Intl.DateTimeFormat(locale, options).format(dateObj);
}

/**
 * Format a month/year consistently
 * @param date - Date string or Date object
 * @returns Formatted month/year string (e.g., "January 2023")
 */
export function formatMonthYear(
  date: string | Date,
  locale: string = 'en-US'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(dateObj);
}
