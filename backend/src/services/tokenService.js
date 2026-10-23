const crypto = require("node:crypto");

const jwt = require("jsonwebtoken");

const { env } = require("../config/env");
const { AppError } = require("../errors/AppError");

function signAccessToken(user) {
  return jwt.sign(
    { email: user.email, role: user.role, type: "access" },
    env.jwt.accessSecret,
    {
      subject: user.id,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      expiresIn: `${env.jwt.accessTtlMinutes}m`,
      jwtid: crypto.randomUUID(),
      algorithm: "HS256",
    },
  );
}

function signRefreshToken(userId, sessionId) {
  return jwt.sign({ type: "refresh" }, env.jwt.refreshSecret, {
    subject: userId,
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    expiresIn: `${env.jwt.refreshTtlDays}d`,
    jwtid: sessionId,
    algorithm: "HS256",
  });
}

function verifyToken(token, secret, expectedType) {
  try {
    const payload = jwt.verify(token, secret, {
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithms: ["HS256"],
    });

    if (
      typeof payload !== "object" ||
      payload.type !== expectedType ||
      !payload.sub ||
      !payload.jti
    ) {
      throw new Error("Token claims are invalid");
    }

    return payload;
  } catch (_error) {
    throw new AppError(401, "INVALID_TOKEN", "The authentication token is invalid or expired");
  }
}

function verifyAccessToken(token) {
  return verifyToken(token, env.jwt.accessSecret, "access");
}

function verifyRefreshToken(token) {
  return verifyToken(token, env.jwt.refreshSecret, "refresh");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshExpirationDate() {
  return new Date(Date.now() + env.jwt.refreshTtlDays * 24 * 60 * 60 * 1_000);
}

module.exports = {
  hashToken,
  refreshExpirationDate,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
