const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const { authenticate } = require("../middleware/authenticate");
const {
  login,
  loginAdmin,
  logout,
  refreshSession,
} = require("../services/authService");

const router = express.Router();

const loginSchema = z.object({
  identity: z.string().trim().min(1).max(254),
  password: z
    .string()
    .min(1)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "Password must not exceed 72 bytes",
    }),
}).strict();
const refreshSchema = z.object({ refreshToken: z.string().trim().min(1).max(4_096) }).strict();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_LOGIN_ATTEMPTS",
      message: "Too many login attempts. Please try again in 15 minutes.",
    },
  },
});

router.post("/admin/login", loginLimiter, async (request, response) => {
  const credentials = loginSchema.parse(request.body);
  const authentication = await loginAdmin(credentials.identity, credentials.password);
  response.json(authentication);
});

router.post("/login", loginLimiter, async (request, response) => {
  const credentials = loginSchema.parse(request.body);
  const authentication = await login(credentials.identity, credentials.password);
  response.json(authentication);
});

router.post("/refresh", async (request, response) => {
  const { refreshToken } = refreshSchema.parse(request.body);
  response.json(await refreshSession(refreshToken));
});

router.post("/logout", async (request, response) => {
  const { refreshToken } = refreshSchema.parse(request.body);
  await logout(refreshToken);
  response.status(204).send();
});

router.get(
  "/me",
  authenticate,
  async (request, response) => {
    response.json({ user: request.user });
  },
);

module.exports = { authRouter: router };
