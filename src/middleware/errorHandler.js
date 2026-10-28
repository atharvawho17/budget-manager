const { HttpError } = require('../utils/httpError');

// Every error leaves the API in the same shape: { error: { message } }
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let message = 'Something went wrong on the server.';

  if (err instanceof HttpError) {
    status = err.status; message = err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Invalid JSON in request body.';
  } else if (err.type === 'entity.too.large') {
    status = 413; message = 'Request body is too large.';
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409; message = 'That record already exists.';
  } else {
    console.error(err);
  }
  res.status(status).json({ error: { message } });
}
module.exports = errorHandler;
