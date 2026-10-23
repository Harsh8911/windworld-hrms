const { app } = require("../app");
const { pool } = require("../db/pool");

let employeeUserId;
let customEmployeeUserId;
let locationId;
let initialEmployeeCounterValue;
let initialShift;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const adminIdentity = process.env.ADMIN_SEED_EMAIL;
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;

  if (!adminIdentity || !adminPassword) {
    throw new Error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD are required for integration tests");
  }

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const body = response.status === 204 ? null : await response.json();
    return { status: response.status, body };
  }

  try {
    const stamp = Date.now();
    const adminLogin = await request("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ identity: adminIdentity, password: adminPassword }),
    });
    assert(adminLogin.status === 200, "Administrator login failed");
    const adminToken = adminLogin.body.accessToken;
    const initialEmployeeCounter = await pool.query(
      "SELECT last_value FROM employee_id_counter WHERE id = 1",
    );
    initialEmployeeCounterValue = initialEmployeeCounter.rows[0].last_value;
    const initialShiftResult = await pool.query(
      `SELECT start_time::text, end_time::text, max_duration_minutes
       FROM work_shifts
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    initialShift = initialShiftResult.rows[0];
    await pool.query(
      `UPDATE work_shifts
       SET start_time = '00:00:00', end_time = '23:59:59', max_duration_minutes = 480
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );

    const location = await request("/admin/attendance-locations", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: `API Test ${stamp}`,
        latitude: 19.094833,
        longitude: 74.748011,
        wifiIp: "192.0.2.10",
        geofenceRadiusMeters: 500,
        isPrimary: false,
      }),
    });
    assert(location.status === 201, "Attendance-location creation failed");
    locationId = location.body.location.id;

    const employeeIdPreviews = await Promise.all([
      request("/admin/employees/next-id", {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      request("/admin/employees/next-id", {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
    ]);
    assert(employeeIdPreviews.every(({ status }) => status === 200), "Employee ID preview failed");
    assert(
      employeeIdPreviews.every(({ body }) => /^WW-\d{3,}$/.test(body.employeeId)),
      "Employee ID format is invalid",
    );
    assert(
      employeeIdPreviews[1].body.employeeId === employeeIdPreviews[0].body.employeeId,
      "Previewing an employee ID consumed the counter",
    );

    const employeeInput = {
      fullName: "API Test Employee",
      employeeId: employeeIdPreviews[0].body.employeeId,
      email: `api-test-${stamp}@windworld.com`,
      phone: "+91 90000 00000",
      designation: "Tester",
      department: "Quality",
      password: "employee@123",
      attendanceLocationId: locationId,
    };
    const employee = await request("/admin/employees", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(employeeInput),
    });
    assert(employee.status === 201, "Employee creation failed");
    employeeUserId = employee.body.employee.id;
    assert(employee.body.employee.attendanceLocation.id === locationId, "Employee response contract is invalid");
    assert(!("password" in employee.body.employee), "Employee response exposed a password");
    const storedEmployee = await pool.query(
      `SELECT users.password_hash, users.username, profiles.employee_id
       FROM users
       JOIN employee_profiles AS profiles ON profiles.user_id = users.id
       WHERE users.id = $1`,
      [employeeUserId],
    );
    assert(
      storedEmployee.rows[0].password_hash !== employeeInput.password &&
        storedEmployee.rows[0].password_hash.startsWith("$2"),
      "Employee password was not stored as a bcrypt hash",
    );
    assert(
      storedEmployee.rows[0].username === employeeInput.employeeId &&
        storedEmployee.rows[0].employee_id === employeeInput.employeeId,
      "Employee login username and profile ID are inconsistent",
    );

    const nextEmployeeId = await request("/admin/employees/next-id", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(nextEmployeeId.status === 200, "Next employee ID preview failed after creation");
    assert(
      Number(nextEmployeeId.body.employeeId.slice(3)) ===
        Number(employeeInput.employeeId.slice(3)) + 1,
      "Employee ID counter did not advance after employee creation",
    );

    const customEmployee = await request("/admin/employees", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: "Custom ID Employee",
        employeeId: `CUSTOM-${stamp}`,
        email: `custom-id-${stamp}@windworld.com`,
        designation: "Tester",
        department: "Quality",
        password: "employee@123",
        attendanceLocationId: locationId,
      }),
    });
    assert(customEmployee.status === 201, "Custom employee ID was rejected");
    assert(
      customEmployee.body.employee.employeeId === `CUSTOM-${stamp}`,
      "Custom employee ID was not preserved",
    );
    customEmployeeUserId = customEmployee.body.employee.id;

    const duplicate = await request("/admin/employees", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(employeeInput),
    });
    assert(duplicate.status === 409 && duplicate.body.error.code === "EMAIL_EXISTS", "Duplicate conflict mapping failed");

    const employees = await request(`/admin/employees?search=${employeeInput.employeeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(employees.status === 200, "Employee listing failed");
    assert(employees.body.employees.length === 1, "Employee list contract is invalid");
    assert(employees.body.summary.total === 1 && employees.body.summary.active === 1, "Employee summary is invalid");

    const locations = await request("/admin/attendance-locations", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(locations.status === 200, "Attendance-location listing failed");
    assert(locations.body.locations.some((item) => item.id === locationId), "Location list contract is invalid");

    const employeeLogin = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identity: employeeInput.employeeId, password: employeeInput.password }),
    });
    assert(employeeLogin.status === 200 && employeeLogin.body.user.role === "EMPLOYEE", "Employee login failed");

    const employeeMe = await request("/auth/me", {
      headers: { Authorization: `Bearer ${employeeLogin.body.accessToken}` },
    });
    assert(employeeMe.status === 200 && employeeMe.body.user.role === "EMPLOYEE", "Employee /me failed");
    assert(
      employeeMe.body.user.employeeProfile?.employeeId === employeeInput.employeeId,
      "Employee /me profile is missing",
    );

    const employeeEmailLogin = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identity: employeeInput.email, password: employeeInput.password }),
    });
    assert(
      employeeEmailLogin.status === 200 && employeeEmailLogin.body.user.role === "EMPLOYEE",
      "Employee email login failed",
    );

    const employeeAuthorization = {
      Authorization: `Bearer ${employeeLogin.body.accessToken}`,
    };
    const initialAttendance = await request("/employee/attendance", {
      headers: employeeAuthorization,
    });
    assert(initialAttendance.status === 200, "Employee attendance overview failed");
    assert(
      initialAttendance.body.shift.name === "General Shift" &&
        initialAttendance.body.sessions.length === 0,
      "Employee attendance overview contains non-database data",
    );

    const outsidePunchIn = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({ latitude: 20.094833, longitude: 74.748011, accuracyMeters: 5 }),
    });
    assert(
      outsidePunchIn.status === 422 && outsidePunchIn.body.error.code === "OUTSIDE_GEOFENCE",
      "An out-of-geofence punch in was accepted",
    );

    const punchInResponse = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({ latitude: 19.094833, longitude: 74.748011, accuracyMeters: 5 }),
    });
    assert(
      punchInResponse.status === 201 && punchInResponse.body.session.status === "IN_PROGRESS",
      "A valid in-geofence punch in was not persisted",
    );

    const duplicatePunchIn = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({ latitude: 19.094833, longitude: 74.748011, accuracyMeters: 5 }),
    });
    assert(
      duplicatePunchIn.status === 409 && duplicatePunchIn.body.error.code === "ALREADY_PUNCHED_IN",
      "A duplicate punch in was accepted",
    );

    const outsidePunchOut = await request("/employee/attendance/punch-out", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({ latitude: 20.094833, longitude: 74.748011, accuracyMeters: 5 }),
    });
    assert(
      outsidePunchOut.status === 422 && outsidePunchOut.body.error.code === "OUTSIDE_GEOFENCE",
      "An out-of-geofence punch out was accepted",
    );

    const punchOutResponse = await request("/employee/attendance/punch-out", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({ latitude: 19.094833, longitude: 74.748011, accuracyMeters: 5 }),
    });
    assert(
      punchOutResponse.status === 200 &&
        punchOutResponse.body.session.status === "COMPLETED" &&
        punchOutResponse.body.session.punchOutReason === "MANUAL",
      "A valid in-geofence punch out was not persisted",
    );

    const persistedAttendance = await request("/employee/attendance", {
      headers: employeeAuthorization,
    });
    assert(
      persistedAttendance.status === 200 &&
        persistedAttendance.body.sessions.length === 1 &&
        persistedAttendance.body.todaySession.status === "COMPLETED",
      "Persisted attendance logs were not returned",
    );

    const adminDailyAttendance = await request(
      `/admin/attendance-logs?period=daily&search=${encodeURIComponent(employeeInput.employeeId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert(adminDailyAttendance.status === 200, "Administrator attendance report failed");
    assert(
      adminDailyAttendance.body.period === "daily" &&
        adminDailyAttendance.body.summary.totalRecords === 1 &&
        adminDailyAttendance.body.logs[0].employee.employeeId === employeeInput.employeeId &&
        adminDailyAttendance.body.logs[0].status === "COMPLETED" &&
        adminDailyAttendance.body.logs[0].location.id === locationId,
      "Administrator daily attendance report contract is invalid",
    );

    const adminMonthlyAttendance = await request(
      `/admin/attendance-logs?period=monthly&search=${encodeURIComponent(employeeInput.employeeId)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert(
      adminMonthlyAttendance.status === 200 &&
        adminMonthlyAttendance.body.summary.uniqueEmployees === 1 &&
        adminMonthlyAttendance.body.summary.totalMinutes >= 0,
      "Administrator monthly attendance report summary is invalid",
    );

    const customEmployeeLogin = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identity: `CUSTOM-${stamp}`, password: "employee@123" }),
    });
    assert(customEmployeeLogin.status === 200, "Custom employee login failed");
    const customAuthorization = {
      Authorization: `Bearer ${customEmployeeLogin.body.accessToken}`,
    };
    const customPunchIn = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: customAuthorization,
      body: JSON.stringify({ latitude: 19.094833, longitude: 74.748011, accuracyMeters: 5 }),
    });
    assert(customPunchIn.status === 201, "Auto-checkout test punch in failed");
    await pool.query(
      "UPDATE work_shifts SET max_duration_minutes = 1 WHERE id = '00000000-0000-0000-0000-000000000001'",
    );
    await pool.query(
      "UPDATE attendance_sessions SET punch_in_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes' WHERE id = $1",
      [customPunchIn.body.session.id],
    );
    const autoClosedAttendance = await request("/employee/attendance", {
      headers: customAuthorization,
    });
    assert(
      autoClosedAttendance.status === 200 &&
        autoClosedAttendance.body.todaySession.status === "COMPLETED" &&
        autoClosedAttendance.body.todaySession.punchOutReason === "AUTO_MAX_DURATION",
      "The maximum-duration auto punch out did not persist",
    );
    await pool.query(
      "UPDATE work_shifts SET max_duration_minutes = 480 WHERE id = '00000000-0000-0000-0000-000000000001'",
    );

    const forbidden = await request("/admin/employees", {
      headers: { Authorization: `Bearer ${employeeLogin.body.accessToken}` },
    });
    assert(forbidden.status === 403, "Employee was not denied an administrator route");

    const forbiddenAttendanceReport = await request("/admin/attendance-logs", {
      headers: { Authorization: `Bearer ${employeeLogin.body.accessToken}` },
    });
    assert(
      forbiddenAttendanceReport.status === 403,
      "Employee was not denied the administrator attendance report",
    );

    const unauthenticated = await request("/admin/employees");
    assert(unauthenticated.status === 401, "Unauthenticated administrator route was accepted");

    const refresh = await request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: employeeLogin.body.refreshToken }),
    });
    assert(refresh.status === 200 && refresh.body.user.role === "EMPLOYEE", "Employee refresh failed");

    const reusedRefresh = await request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: employeeLogin.body.refreshToken }),
    });
    assert(reusedRefresh.status === 401, "A rotated refresh token was accepted again");

    const invalidLocation = await request("/admin/attendance-locations", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: "Bad", latitude: 91, longitude: 0, geofenceRadiusMeters: 0 }),
    });
    assert(invalidLocation.status === 400 && invalidLocation.body.error.code === "VALIDATION_ERROR", "Location validation failed");

    await pool.query("UPDATE users SET is_active = FALSE WHERE id = $1", [employeeUserId]);
    const inactiveMe = await request("/auth/me", {
      headers: { Authorization: `Bearer ${refresh.body.accessToken}` },
    });
    assert(inactiveMe.status === 401 && inactiveMe.body.error.code === "ACCOUNT_UNAVAILABLE", "Inactive access token was accepted");

    const inactiveRefresh = await request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: refresh.body.refreshToken }),
    });
    assert(inactiveRefresh.status === 401, "Inactive refresh token was accepted");

    console.log("Integration checks passed: admin auth, employee IDs, employee login, real database attendance logs, admin daily/monthly attendance reports, shift data, geofence rejection, persisted punch in/out, duplicate prevention, automatic maximum-duration checkout, password hashing, refresh rotation, validation, conflicts, role authorization, and active-account enforcement.");
  } finally {
    if (employeeUserId) {
      await pool.query("DELETE FROM users WHERE id = $1", [employeeUserId]);
    }
    if (customEmployeeUserId) {
      await pool.query("DELETE FROM users WHERE id = $1", [customEmployeeUserId]);
    }
    if (locationId) {
      await pool.query("DELETE FROM attendance_locations WHERE id = $1", [locationId]);
    }
    if (initialEmployeeCounterValue !== undefined) {
      await pool.query(
        "UPDATE employee_id_counter SET last_value = $1 WHERE id = 1",
        [initialEmployeeCounterValue],
      );
    }
    if (initialShift) {
      await pool.query(
        `UPDATE work_shifts
         SET start_time = $1, end_time = $2, max_duration_minutes = $3
         WHERE id = '00000000-0000-0000-0000-000000000001'`,
        [initialShift.start_time, initialShift.end_time, initialShift.max_duration_minutes],
      );
    }
    await pool.end();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error("Integration checks failed:", error.message);
  process.exitCode = 1;
});
