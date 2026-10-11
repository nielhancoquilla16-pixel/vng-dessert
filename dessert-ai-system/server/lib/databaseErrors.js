export const isDatabaseUnavailableError = (error) => (
  // Query cancellation, lock timeout, exhausted connections, or server restart.
  ['57014', '55P03', '53300', '57P01', '57P02', '57P03'].includes(error?.code)
  || /^08[0-9A-Z]{3}$/.test(error?.code || '')
);
