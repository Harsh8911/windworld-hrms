const { AppError } = require("../errors/AppError");
const { getUserById } = require("../services/authService");
const { verifyAccessToken } = require("../services/tokenService");

async function authenticate(request, _response, next) {
  const authorization = request.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return next(new AppError(401, "AUTHENTICATION_REQUIRED", "A bearer token is required"));
  }

  const token = authorization.slice("Bearer ".length).trim();
  const payload = verifyAccessToken(token);
  const user = await getUserById(payload.sub);

  request.auth = { ...payload, role: user.role };
  request.user = user;
  return next();
}

module.exports = { authenticate };
