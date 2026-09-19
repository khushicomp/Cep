exports.errorHandler = (err, req, res, next) => {
  console.error("Request failed");

  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status : 500;
  res.status(status).json({
    success: false,
    message: status >= 500 ? "Internal Server Error" : "Invalid request"
  });
};
