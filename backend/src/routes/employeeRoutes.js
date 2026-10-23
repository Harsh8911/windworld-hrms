const express = require("express");
const { z } = require("zod");

const { authenticate } = require("../middleware/authenticate");
const { requireRole } = require("../middleware/requireRole");
const {
  getAttendanceOverview,
  punchIn,
  punchOut,
} = require("../services/attendanceService");

const router = express.Router();

const positionSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracyMeters: z.number().finite().nonnegative().max(1000),
  })
  .strict();

router.use(authenticate, requireRole("EMPLOYEE"));

router.get("/attendance", async (request, response) => {
  response.json(await getAttendanceOverview(request.user.id));
});

router.post("/attendance/punch-in", async (request, response) => {
  const position = positionSchema.parse(request.body);
  response.status(201).json({ session: await punchIn(request.user.id, position) });
});

router.post("/attendance/punch-out", async (request, response) => {
  const position = positionSchema.parse(request.body);
  response.json({ session: await punchOut(request.user.id, position) });
});

module.exports = { employeeRouter: router };
