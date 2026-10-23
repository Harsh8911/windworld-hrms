import { API_BASE_URL } from "../constants/config";
import type {
  ApiErrorResponse,
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
  try {
    return await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
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
  return response.user;
}

export function getEmployees(): Promise<EmployeesResponse> {
  return authenticatedRequest<EmployeesResponse>("/admin/employees");
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
  attendanceLocationId?: string;
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

export function getAttendanceOverview(): Promise<AttendanceOverview> {
  return authenticatedRequest<AttendanceOverview>("/employee/attendance");
}

export function punchIn(
  position: AttendancePositionInput,
): Promise<{ session: AttendanceSession }> {
  return authenticatedRequest<{ session: AttendanceSession }>(
    "/employee/attendance/punch-in",
    { method: "POST", body: JSON.stringify(position) },
  );
}

export function punchOut(
  position: AttendancePositionInput,
): Promise<{ session: AttendanceSession }> {
  return authenticatedRequest<{ session: AttendanceSession }>(
    "/employee/attendance/punch-out",
    { method: "POST", body: JSON.stringify(position) },
  );
}
