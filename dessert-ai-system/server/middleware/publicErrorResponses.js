import { httpErrorStatus, publicErrorDetails, publicErrorMessage } from '../lib/publicErrors.js';

// Covers direct route responses as well as errors forwarded to the final handler.
export const publicErrorResponses = (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (payload) => {
    if (res.statusCode < 400) return json(payload);
    const code = httpErrorStatus(res.statusCode);
    if (!res.locals.errorLogged) {
      console.error('Request failed:', { method: req.method, path: req.path, status: code, diagnostic: payload });
    }
    const message = publicErrorMessage(payload?.error || payload?.message, code, payload?.errorCode);
    return json({
      status: 'error',
      code,
      error: message,
      message,
      ...publicErrorDetails(payload, code),
    });
  };
  next();
};
