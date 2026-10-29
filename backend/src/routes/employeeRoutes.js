const express = require("express");
const { z } = require("zod");

const { authenticate } = require("../middleware/authenticate");
const { requireRole } = require("../middleware/requireRole");
const {
  getAttendanceOverview,
  punchIn,
  punchOut,
} = require("../services/attendanceService");
const { getUserById } = require("../services/authService");
const { updateOwnProfile } = require("../services/employeeService");
const {
  listEmployeeNotifications,
  markEmployeeNotificationRead,
} = require("../services/notificationService");

const router = express.Router();

const punchSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracyMeters: z.number().finite().nonnegative().max(1000),
    attendanceLocationId: z.string().uuid().optional(),
  })
  .strict();

const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    phone: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z
        .string()
        .trim()
        .regex(/^\d{10}$/, "Phone number must contain exactly 10 digits")
        .nullable(),
    ),
  })
  .strict();
const notificationIdSchema = z.string().uuid();

router.use(authenticate, requireRole("EMPLOYEE"));

router.get("/attendance", async (request, response) => {
  response.json(await getAttendanceOverview(request.user.id));
});

router.patch("/profile", async (request, response) => {
  const input = updateProfileSchema.parse(request.body);
  await updateOwnProfile(request.user.id, input);
  response.json({ user: await getUserById(request.user.id) });
});

router.get("/notifications", async (request, response) => {
  response.json(await listEmployeeNotifications(request.user.id));
});

router.patch("/notifications/:notificationId/read", async (request, response) => {
  const notificationId = notificationIdSchema.parse(request.params.notificationId);
  response.json({
    notification: await markEmployeeNotificationRead(request.user.id, notificationId),
  });
});

router.post("/attendance/punch-in", async (request, response) => {
  const input = punchSchema.parse(request.body);
  const { attendanceLocationId, ...position } = input;
  response.status(201).json({
    session: await punchIn(request.user.id, {
      position,
      attendanceLocationId,
    }),
  });
});

router.post("/attendance/punch-out", async (request, response) => {
  const input = punchSchema.parse(request.body);
  const { attendanceLocationId, ...position } = input;
  response.json({
    session: await punchOut(request.user.id, {
      position,
      attendanceLocationId,
    }),
  });
});

module.exports = { employeeRouter: router };
