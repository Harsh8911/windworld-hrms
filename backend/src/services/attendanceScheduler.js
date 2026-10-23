const { autoPunchOutExpiredSessions } = require("./attendanceService");

function startAttendanceScheduler(intervalMilliseconds = 60_000) {
  const run = () => {
    autoPunchOutExpiredSessions().catch((error) => {
      console.error("Attendance auto-punch-out failed", error);
    });
  };

  run();
  const timer = setInterval(run, intervalMilliseconds);
  timer.unref();

  return () => clearInterval(timer);
}

module.exports = { startAttendanceScheduler };
