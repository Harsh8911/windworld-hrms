const net = require("node:net");

const express = require("express");
const { z } = require("zod");

const { authenticate } = require("../middleware/authenticate");
const { requireRole } = require("../middleware/requireRole");
const {
  createAttendanceLocation,
  listAttendanceLocations,
} = require("../services/attendanceLocationService");
const {
  createEmployee,
  deleteEmployee,
  getNextEmployeeId,
  listEmployees,
  setEmployeeArchived,
  updateEmployee,
} = require("../services/employeeService");
const { listAdminAttendanceLogs } = require("../services/adminAttendanceService");
const {
  getAdminSettings,
  updateGeneralShift,
} = require("../services/adminSettingsService");

const router = express.Router();

const optionalTrimmedString = (maxLength) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional(),
  );

const optionalPhoneNumber = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Phone number must contain exactly 10 digits")
    .optional(),
);

const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must not exceed 72 bytes",
  });

const createEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    employeeId: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Employee ID may contain letters, numbers, hyphens, and underscores"),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: optionalPhoneNumber,
    designation: optionalTrimmedString(120),
    department: optionalTrimmedString(120),
    password: passwordSchema,
    employeeRole: z.enum(["EMPLOYEE", "MANAGER"]).optional().default("EMPLOYEE"),
    attendanceLocationIds: z
      .array(z.string().uuid())
      .max(100)
      .optional()
      .default([])
      .transform((locationIds) => [...new Set(locationIds)]),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.employeeRole === "EMPLOYEE" && input.attendanceLocationIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["attendanceLocationIds"],
        message: "Assign at least one attendance location to an employee",
      });
    }
  });

const updateEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: z
      .preprocess(
        (value) => (typeof value === "string" && value.trim() === "" ? null : value),
        z
          .string()
          .trim()
          .regex(/^\d{10}$/, "Phone number must contain exactly 10 digits")
          .nullable(),
      ),
    designation: z.string().trim().min(1).max(120),
    department: z.string().trim().min(1).max(120),
    employeeRole: z.enum(["EMPLOYEE", "MANAGER"]),
    attendanceLocationIds: z
      .array(z.string().uuid())
      .max(100)
      .transform((locationIds) => [...new Set(locationIds)]),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.employeeRole === "EMPLOYEE" && input.attendanceLocationIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["attendanceLocationIds"],
        message: "Assign at least one attendance location to an employee",
      });
    }
  });

const archiveEmployeeSchema = z.object({ archived: z.boolean() }).strict();
const employeeIdSchema = z.string().uuid();

const listEmployeesSchema = z
  .object({
    search: z.string().trim().max(150).optional().default(""),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();

const numericCoordinate = (minimum, maximum) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    z.number().finite().min(minimum).max(maximum),
  );

const createLocationSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    latitude: numericCoordinate(-90, 90),
    longitude: numericCoordinate(-180, 180),
    wifiIp: z
      .preprocess(
        (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
        z.string().trim().refine((value) => net.isIP(value) !== 0, "Enter a valid IPv4 or IPv6 address").optional(),
      ),
    geofenceRadiusMeters: z.coerce.number().int().min(1).max(100_000),
    isPrimary: z.boolean().optional().default(false),
  })
  .strict();

const listLocationsSchema = z
  .object({
    includeInactive: z
      .enum(["true", "false"])
      .optional()
      .default("false")
      .transform((value) => value === "true"),
  })
  .strict();

const listAttendanceLogsSchema = z
  .object({
    period: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
    anchorDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Anchor date must use YYYY-MM-DD")
      .refine((value) => {
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      }, "Anchor date is invalid")
      .optional(),
    search: z.string().trim().max(150).optional().default(""),
    limit: z.coerce.number().int().min(1).max(500).optional().default(250),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();

const shiftTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, "Time must use the 24-hour HH:mm format")
  .refine((value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }, "Enter a valid 24-hour time");

const shiftSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    startTime: shiftTimeSchema,
    endTime: shiftTimeSchema,
    maxDurationMinutes: z.coerce.number().int().min(30).max(1440),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_+\-/]+$/, "Enter a valid IANA timezone"),
  })
  .strict()
  .superRefine((input, context) => {
    const [startHours, startMinutes] = input.startTime.split(":").map(Number);
    const [endHours, endMinutes] = input.endTime.split(":").map(Number);
    const scheduledMinutes = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);

    if (scheduledMinutes <= 0) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Shift end time must be later than its start time",
      });
    } else if (input.maxDurationMinutes > scheduledMinutes) {
      context.addIssue({
        code: "custom",
        path: ["maxDurationMinutes"],
        message: "Maximum duration cannot exceed the scheduled shift length",
      });
    }
  });

router.use(authenticate, requireRole("ADMIN"));

router.get("/employees", async (request, response) => {
  const query = listEmployeesSchema.parse(request.query);
  response.json(await listEmployees(query));
});

router.get("/employees/next-id", async (request, response) => {
  response.json({ employeeId: await getNextEmployeeId() });
});

router.post("/employees", async (request, response) => {
  const input = createEmployeeSchema.parse(request.body);
  const employee = await createEmployee(input, request.user.id);
  response.status(201).json({ employee });
});

router.patch("/employees/:employeeUserId", async (request, response) => {
  const employeeUserId = employeeIdSchema.parse(request.params.employeeUserId);
  const input = updateEmployeeSchema.parse(request.body);
  const employee = await updateEmployee(employeeUserId, input, request.user.id);
  response.json({ employee });
});

router.patch("/employees/:employeeUserId/archive", async (request, response) => {
  const employeeUserId = employeeIdSchema.parse(request.params.employeeUserId);
  const { archived } = archiveEmployeeSchema.parse(request.body);
  const employee = await setEmployeeArchived(employeeUserId, archived);
  response.json({ employee });
});

router.delete("/employees/:employeeUserId", async (request, response) => {
  const employeeUserId = employeeIdSchema.parse(request.params.employeeUserId);
  await deleteEmployee(employeeUserId);
  response.status(204).send();
});

router.get("/attendance-locations", async (request, response) => {
  const query = listLocationsSchema.parse(request.query);
  const locations = await listAttendanceLocations(query);
  response.json({ locations });
});

router.post("/attendance-locations", async (request, response) => {
  const input = createLocationSchema.parse(request.body);
  const location = await createAttendanceLocation(input, request.user.id);
  response.status(201).json({ location });
});

router.get("/attendance-logs", async (request, response) => {
  const query = listAttendanceLogsSchema.parse(request.query);
  response.json(await listAdminAttendanceLogs(query));
});

router.get("/settings", async (_request, response) => {
  response.json(await getAdminSettings());
});

router.patch("/settings/shift", async (request, response) => {
  const input = shiftSettingsSchema.parse(request.body);
  response.json(await updateGeneralShift(input, request.user.id));
});

module.exports = { adminRouter: router };
