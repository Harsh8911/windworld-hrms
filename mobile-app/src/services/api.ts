import { API_BASE_URL } from "../constants/config";
import type {
  ApiErrorResponse,
  AdminSettingsResponse,
  AdminAttendanceLogsResponse,
  AttendanceOverview,
  AttendancePositionInput,
  AttendanceSession,
  AttendanceLocation,
  AttendanceLocationsResponse,
  AuthenticationResponse,
  AuthenticatedUser,
  Employee,
  EmployeesResponse,
  HealthStatus,
} from "../types/api";
import type { AdminAttendancePeriod } from "../types/admin";
import {
  clearAuthentication,
  getAuthenticationTokens,
  saveAuthentication,
} from "./authStorage";

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let errorBody: ApiErrorResponse | undefined;

  try {
    errorBody = (await response.json()) as ApiErrorResponse;
  } catch {
    // The server may return an empty or non-JSON response.
  }

  return new ApiError(
    errorBody?.error?.details?.[0]?.message ??
      errorBody?.error?.message ??
      "The server could not complete the request.",
    response.status,
    errorBody?.error?.code,
  );
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as HealthStatus;
}

async function fetchApi(path: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(
        "The server took too long to respond. Check your connection and try again.",
        0,
        "REQUEST_TIMEOUT",
      );
    }

    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function login(
  identity: string,
  password: string,
): Promise<AuthenticationResponse> {
  const response = await fetchApi("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, password }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as AuthenticationResponse;
}

export async function refreshAuthentication(
  refreshToken: string,
): Promise<AuthenticationResponse> {
  const response = await fetchApi("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as AuthenticationResponse;
}

let activeRefresh: Promise<AuthenticationResponse> | null = null;

function refreshOnce(refreshToken: string) {
  if (!activeRefresh) {
    activeRefresh = refreshAuthentication(refreshToken).finally(() => {
      activeRefresh = null;
    });
  }

  return activeRefresh;
}

export async function logout(refreshToken: string): Promise<void> {
  const response = await fetchApi("/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }
}

async function authenticatedRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const tokens = await getAuthenticationTokens();

  if (!tokens) {
    throw new ApiError("Your session has expired. Please sign in again.", 401, "NO_SESSION");
  }

  const send = (accessToken: string) =>
    fetchApi(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let response = await send(tokens.accessToken);

  if (response.status === 401) {
    try {
      const authentication = await refreshOnce(tokens.refreshToken);
      await saveAuthentication(authentication);
      response = await send(authentication.accessToken);
    } catch (error) {
      await clearAuthentication();
      throw error;
    }
  }

  if (!response.ok) {
    if (response.status === 401) await clearAuthentication();
    throw await parseError(response);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const response = await authenticatedRequest<{ user: AuthenticatedUser }>("/auth/me");
  const profile = response.user.employeeProfile;
  if (!profile) return response.user;

  const attendanceLocations = Array.isArray(profile.attendanceLocations)
    ? profile.attendanceLocations
    : profile.attendanceLocation
      ? [profile.attendanceLocation]
      : [];

  return {
    ...response.user,
    employeeProfile: {
      ...profile,
      employeeRole: profile.employeeRole ?? "EMPLOYEE",
      attendanceLocations,
      attendanceLocation: profile.attendanceLocation ?? attendanceLocations[0] ?? null,
    },
  };
}

export async function getEmployees(): Promise<EmployeesResponse> {
  const response = await authenticatedRequest<EmployeesResponse>("/admin/employees");
  return {
    ...response,
    employees: response.employees.map((employee) => {
      const attendanceLocations = Array.isArray(employee.attendanceLocations)
        ? employee.attendanceLocations
        : employee.attendanceLocation
          ? [employee.attendanceLocation]
          : [];

      return {
        ...employee,
        employeeRole: employee.employeeRole ?? "EMPLOYEE",
        isActive: employee.isActive ?? employee.status !== "INACTIVE",
        attendanceLocations,
        attendanceLocation: employee.attendanceLocation ?? attendanceLocations[0] ?? null,
      };
    }),
  };
}

export function getNextEmployeeId(): Promise<{ employeeId: string }> {
  return authenticatedRequest<{ employeeId: string }>("/admin/employees/next-id");
}

export type CreateEmployeeInput = {
  fullName: string;
  employeeId: string;
  email: string;
  phone?: string;
  designation: string;
  department: string;
  password: string;
  employeeRole: "EMPLOYEE" | "MANAGER";
  attendanceLocationIds: string[];
};

export function createEmployee(input: CreateEmployeeInput): Promise<{ employee: Employee }> {
  return authenticatedRequest<{ employee: Employee }>("/admin/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAttendanceLocations(): Promise<AttendanceLocationsResponse> {
  return authenticatedRequest<AttendanceLocationsResponse>("/admin/attendance-locations");
}

export function getAdminAttendanceLogs(
  period: AdminAttendancePeriod,
  search = "",
): Promise<AdminAttendanceLogsResponse> {
  const query = new URLSearchParams({ period });
  if (search.trim()) query.set("search", search.trim());
  return authenticatedRequest<AdminAttendanceLogsResponse>(
    `/admin/attendance-logs?${query.toString()}`,
  );
}

export type CreateAttendanceLocationInput = {
  name: string;
  latitude: number;
  longitude: number;
  wifiIp?: string;
  geofenceRadiusMeters: number;
  isPrimary: boolean;
};

export function createAttendanceLocation(
  input: CreateAttendanceLocationInput,
): Promise<{ location: AttendanceLocation }> {
  return authenticatedRequest<{ location: AttendanceLocation }>(
    "/admin/attendance-locations",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function getAttendanceOverview(): Promise<AttendanceOverview> {
  const overview = await authenticatedRequest<AttendanceOverview>("/employee/attendance");
  return {
    ...overview,
    employeeRole: overview.employeeRole ?? "EMPLOYEE",
    availableLocations: Array.isArray(overview.availableLocations)
      ? overview.availableLocations
      : [],
  };
}

export function getAdminSettings(): Promise<AdminSettingsResponse> {
  return authenticatedRequest<AdminSettingsResponse>("/admin/settings");
}

export type UpdateAdminShiftInput = {
  name: string;
  startTime: string;
  endTime: string;
  maxDurationMinutes: number;
  timezone: string;
};

export function updateAdminShift(
  input: UpdateAdminShiftInput,
): Promise<AdminSettingsResponse> {
  return authenticatedRequest<AdminSettingsResponse>("/admin/settings/shift", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type UpdateEmployeeInput = {
  fullName: string;
  email: string;
  phone: string | null;
  designation: string;
  department: string;
  employeeRole: "EMPLOYEE" | "MANAGER";
  attendanceLocationIds: string[];
};

export function updateEmployee(
  employeeId: string,
  input: UpdateEmployeeInput,
): Promise<{ employee: Employee }> {
  return authenticatedRequest<{ employee: Employee }>(`/admin/employees/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function setEmployeeArchived(
  employeeId: string,
  archived: boolean,
): Promise<{ employee: Employee }> {
  return authenticatedRequest<{ employee: Employee }>(
    `/admin/employees/${employeeId}/archive`,
    { method: "PATCH", body: JSON.stringify({ archived }) },
  );
}

export function deleteEmployee(employeeId: string): Promise<void> {
  return authenticatedRequest<void>(`/admin/employees/${employeeId}`, {
    method: "DELETE",
  });
}

export function updateOwnProfile(input: {
  fullName: string;
  phone: string | null;
}): Promise<{ user: AuthenticatedUser }> {
  return authenticatedRequest<{ user: AuthenticatedUser }>("/employee/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function punchIn(
  position: AttendancePositionInput,
  attendanceLocationId?: string,
): Promise<{ session: AttendanceSession }> {
  return authenticatedRequest<{ session: AttendanceSession }>(
    "/employee/attendance/punch-in",
    { method: "POST", body: JSON.stringify({ ...position, attendanceLocationId }) },
  );
}

export function punchOut(
  position: AttendancePositionInput,
  attendanceLocationId?: string,
): Promise<{ session: AttendanceSession }> {
  return authenticatedRequest<{ session: AttendanceSession }>(
    "/employee/attendance/punch-out",
    { method: "POST", body: JSON.stringify({ ...position, attendanceLocationId }) },
  );
}
