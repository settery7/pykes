// Express 4 doesn't forward a rejected promise from an async handler to the
// error middleware — it becomes an unhandled rejection, which crashes the
// whole process under `node --watch`. Wrap every async route with this.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
