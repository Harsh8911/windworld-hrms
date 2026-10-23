const { AppError } = require("../errors/AppError");

function requireRole(...allowedRoles) {
  return (request, _response, next) => {
    if (!request.auth) {
      return next(new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required"));
    }

    if (!allowedRoles.includes(request.auth.role)) {
      return next(new AppError(403, "FORBIDDEN", "You do not have permission to access this resource"));
    }

    return next();
  };
}

module.exports = { requireRole };
