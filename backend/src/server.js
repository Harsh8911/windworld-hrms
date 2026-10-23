const { app } = require("./app");
const { env } = require("./config/env");
const { pool } = require("./db/pool");
const { startAttendanceScheduler } = require("./services/attendanceScheduler");

const stopAttendanceScheduler = startAttendanceScheduler();

const server = app.listen(env.port, () => {
  console.log(`Windworld API listening on http://localhost:${env.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  stopAttendanceScheduler();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
