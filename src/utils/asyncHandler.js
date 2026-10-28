// Lets async route handlers throw; errors are forwarded to the error middleware.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
