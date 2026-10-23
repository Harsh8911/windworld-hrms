const cors = require("cors");
const express = require("express");
const helmet = require("helmet");

const { env } = require("./config/env");
const { AppError } = require("./errors/AppError");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { adminRouter } = require("./routes/adminRoutes");
const { authRouter } = require("./routes/authRoutes");
const { employeeRouter } = require("./routes/employeeRoutes");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new AppError(403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed"));
    },
  }),
);
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "windworld-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/employee", employeeRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = { app };
