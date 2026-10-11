import { httpErrorStatus } from '../lib/publicErrors.js';
import { isDatabaseUnavailableError } from '../lib/databaseErrors.js';

export const requestErrorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const malformed = error?.type === 'entity.parse.failed'
    || (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body'));
  if (malformed) {
    // The parser exception includes the submitted body, potentially passwords.
    console.warn('Rejected malformed JSON request:', { method: req.method, path: req.path });
    res.locals.errorLogged = true;
    return res.status(400).json({ error: 'Please check your information and try again.' });
  }
  console.error('Request exception:', { method: req.method, path: req.path, error });
  res.locals.errorLogged = true;
  const diagnostic = [error?.message, error?.details, error?.cause?.code].filter(Boolean).join(' ');
  const unavailable = isDatabaseUnavailableError(error)
    || /fetch failed|ENOTFOUND|ECONN\w*|ETIMEDOUT|EACCES|configuration is incomplete/i.test(diagnostic);
  const status = httpErrorStatus(error?.status || error?.statusCode, unavailable ? 503 : 500);
  // Unexpected exceptions and external provider errors never become UI copy,
  // even when an external provider attaches a client-error HTTP status.
  res.status(status).json({ error: error?.publicMessage || '', errorCode: error?.errorCode });
};
