import express from 'express';

/**
 * express.Router() whose handlers may be async.
 *
 * Express 4 ignores rejected promises from route handlers. On Node 15+ an
 * unhandled rejection kills the process, so one bad request could take the
 * server down for everyone. This router forwards those errors to next(err),
 * where the JSON error handler in index.js answers with a 500.
 */
export function asyncRouter() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) =>
      original(
        path,
        ...handlers.map((handler) =>
          handler.length >= 4
            ? handler // error middleware: leave untouched
            : (req, res, next) => {
                try {
                  const result = handler(req, res, next);
                  if (result && typeof result.catch === 'function') result.catch(next);
                } catch (err) {
                  next(err);
                }
              }
        )
      );
  }
  return router;
}
