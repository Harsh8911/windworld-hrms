const { ZodError } = require("zod");

const { AppError } = require("../errors/AppError");

function notFound(_request, _response, next) {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
}

function errorHandler(error, _request, response, _next) {
  if (error instanceof ZodError) {
    return response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request data is invalid",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  console.error("Unhandled request error", error);
  return response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}

module.exports = { errorHandler, notFound };
