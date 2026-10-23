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
  getNextEmployeeId,
  listEmployees,
} = require("../services/employeeService");
const { listAdminAttendanceLogs } = require("../services/adminAttendanceService");

const router = express.Router();

const optionalTrimmedString = (maxLength) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional(),
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
    phone: optionalTrimmedString(30),
    designation: optionalTrimmedString(120),
    department: optionalTrimmedString(120),
    password: passwordSchema,
    attendanceLocationId: z.string().uuid().nullish().transform((value) => value ?? undefined),
  })
  .strict();

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

module.exports = { adminRouter: router };
