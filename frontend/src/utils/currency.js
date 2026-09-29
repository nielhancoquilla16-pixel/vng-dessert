const amountFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Display only: accept numeric amounts and legacy formatted order totals.
export const formatCurrency = (amount = 0) => {
  const numericAmount = typeof amount === 'string'
    ? Number(amount.trim().replace(/PHP|₱|,/gi, '').replace(/\s/g, ''))
    : Number(amount);
  const formatted = amountFormatter.format(Number.isFinite(numericAmount) ? numericAmount : 0)
    .replace(/\.00$/, '');
  if (formatted === '-0') return '₱0';
  return formatted.startsWith('-') ? `-₱${formatted.slice(1)}` : `₱${formatted}`;
};

// Format amounts in displayed assistant replies without changing chat/API data.
export const formatCurrencyText = (text = '') => String(text).replace(
  /(?:\bPHP\s*|₱\s*)(-?\d+(?:,\d{3})*(?:\.\d+)?)/gi,
  (_, amount) => formatCurrency(amount),
);
