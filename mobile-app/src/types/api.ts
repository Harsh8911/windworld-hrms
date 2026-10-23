export type HealthStatus = {
  status: "ok";
  service: string;
};

export type UserRole = "ADMIN" | "EMPLOYEE";

export type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: UserRole;
  employeeProfile?: EmployeeProfile;
};

export type AuthenticationResponse = {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
};

export type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{
      field?: string;
      message?: string;
    }>;
  };
};

export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE" | string;

export type AttendanceLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  wifiIp: string | null;
  geofenceRadiusMeters: number;
  isPrimary: boolean;
  isActive?: boolean;
};

export type AttendanceLocationSummary = Pick<AttendanceLocation, "id" | "name">;

export type EmployeeProfile = {
  employeeId: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  status: EmployeeStatus;
  attendanceLocation: AttendanceLocation | null;
};

export type Employee = {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  status: EmployeeStatus;
  attendanceLocation: AttendanceLocationSummary | null;
};

export type EmployeesResponse = {
  employees: Employee[];
  summary: {
    total: number;
    active: number;
  };
};

export type AttendanceLocationsResponse = {
  locations: AttendanceLocation[];
};

export type AttendanceShift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  maxDurationMinutes: number;
  timezone: string;
};

export type AttendanceSession = {
  id: string;
  attendanceDate: string;
  punchInAt: string;
  punchOutAt: string | null;
  durationMinutes: number;
  status: "IN_PROGRESS" | "COMPLETED";
  isLate: boolean;
  punchOutReason: "MANUAL" | "AUTO_SHIFT_END" | "AUTO_MAX_DURATION" | null;
  location: AttendanceLocationSummary;
};

export type AttendanceOverview = {
  serverTime: string;
  attendanceDate: string;
  shift: AttendanceShift;
  todaySession: AttendanceSession | null;
  sessions: AttendanceSession[];
  currentMonth: {
    daysPresent: number;
    workedMinutes: number;
  };
};

export type AttendancePositionInput = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type AdminAttendanceLog = {
  id: string;
  attendanceDate: string;
  employee: {
    id: string;
    employeeId: string;
    fullName: string;
    designation: string | null;
    department: string | null;
  };
  location: AttendanceLocationSummary;
  shift: {
    name: string;
    startTime: string;
    endTime: string;
    timezone: string;
  };
  punchInAt: string;
  punchOutAt: string | null;
  durationMinutes: number;
  status: "IN_PROGRESS" | "COMPLETED";
  isLate: boolean;
  punchOutReason: "MANUAL" | "AUTO_SHIFT_END" | "AUTO_MAX_DURATION" | null;
  punchIn: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    distanceMeters: number;
  };
  punchOut: {
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    distanceMeters: number | null;
  } | null;
};

export type AdminAttendanceLogsResponse = {
  period: "daily" | "weekly" | "monthly";
  range: {
    anchorDate: string;
    startDate: string;
    endDate: string;
    timezone: string;
  };
  summary: {
    totalRecords: number;
    uniqueEmployees: number;
    inProgress: number;
    lateRecords: number;
    totalMinutes: number;
  };
  logs: AdminAttendanceLog[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};
