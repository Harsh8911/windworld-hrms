const { app } = require("../app");
const { pool } = require("../db/pool");

let employeeUserId;
let customEmployeeUserId;
let locationId;
let secondLocationId;
let unassignedLocationId;
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
      `SELECT name, start_time::text, end_time::text, max_duration_minutes,
              timezone, auto_checkout_enabled, auto_checkout_delay_minutes, updated_by
       FROM work_shifts
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    initialShift = initialShiftResult.rows[0];
    await pool.query(
      `UPDATE work_shifts
       SET start_time = '00:00:00', end_time = '23:59:59', max_duration_minutes = 480,
           auto_checkout_enabled = TRUE, auto_checkout_delay_minutes = 30
      WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );

    const adminSettings = await request("/admin/settings", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminSettings.status === 200 &&
        adminSettings.body.shift.startTime === "00:00" &&
        adminSettings.body.shift.endTime === "23:59" &&
        adminSettings.body.shift.maxDurationMinutes === 480 &&
        adminSettings.body.shift.autoCheckoutEnabled === true &&
        adminSettings.body.shift.autoCheckoutDelayMinutes === 30,
      "Administrator settings could not be loaded",
    );
    const invalidShiftSettings = await request("/admin/settings/shift", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: `Integration Shift ${stamp}`,
        startTime: "10:00",
        endTime: "18:00",
        maxDurationMinutes: 600,
        timezone: "Asia/Kolkata",
        autoCheckoutEnabled: true,
        autoCheckoutDelayMinutes: 30,
      }),
    });
    assert(
      invalidShiftSettings.status === 400 &&
        invalidShiftSettings.body.error.code === "VALIDATION_ERROR",
      "Invalid shift duration was accepted",
    );
    const invalidTimezoneSettings = await request("/admin/settings/shift", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "General Shift",
        startTime: "00:00",
        endTime: "23:59",
        maxDurationMinutes: 480,
        timezone: "Invalid/Timezone",
        autoCheckoutEnabled: true,
        autoCheckoutDelayMinutes: 30,
      }),
    });
    assert(
      invalidTimezoneSettings.status === 422 &&
        invalidTimezoneSettings.body.error.code === "INVALID_TIMEZONE",
      "Invalid shift timezone was accepted",
    );
    const invalidAutoCheckoutDelay = await request("/admin/settings/shift", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "General Shift",
        startTime: "00:00",
        endTime: "23:59",
        maxDurationMinutes: 480,
        timezone: "Asia/Kolkata",
        autoCheckoutEnabled: true,
        autoCheckoutDelayMinutes: 29,
      }),
    });
    assert(
      invalidAutoCheckoutDelay.status === 400 &&
        invalidAutoCheckoutDelay.body.error.code === "VALIDATION_ERROR",
      "An auto-checkout delay outside the 30-40 minute range was accepted",
    );
    const updatedSettings = await request("/admin/settings/shift", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "General Shift",
        startTime: "00:00",
        endTime: "23:59",
        maxDurationMinutes: 480,
        timezone: "Asia/Kolkata",
        autoCheckoutEnabled: false,
        autoCheckoutDelayMinutes: 35,
      }),
    });
    assert(
      updatedSettings.status === 200 &&
        updatedSettings.body.shift.name === "General Shift" &&
        updatedSettings.body.shift.timezone === "Asia/Kolkata" &&
        updatedSettings.body.shift.autoCheckoutEnabled === false &&
        updatedSettings.body.shift.autoCheckoutDelayMinutes === 35,
      "Administrator shift customization was not persisted",
    );
    const shiftAudit = await pool.query(
      "SELECT updated_by FROM work_shifts WHERE id = '00000000-0000-0000-0000-000000000001'",
    );
    assert(
      shiftAudit.rows[0].updated_by === adminLogin.body.user.id,
      "Shift customization did not record the administrator audit identity",
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

    const secondLocation = await request("/admin/attendance-locations", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: `API Test Secondary ${stamp}`,
        latitude: 18.52043,
        longitude: 73.856744,
        geofenceRadiusMeters: 500,
        isPrimary: false,
      }),
    });
    assert(secondLocation.status === 201, "Second attendance-location creation failed");
    secondLocationId = secondLocation.body.location.id;

    const unassignedLocation = await request("/admin/attendance-locations", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: `API Test Unassigned ${stamp}`,
        latitude: 17.385,
        longitude: 78.4867,
        geofenceRadiusMeters: 500,
        isPrimary: false,
      }),
    });
    assert(unassignedLocation.status === 201, "Unassigned attendance-location creation failed");
    unassignedLocationId = unassignedLocation.body.location.id;

    const updatedLocation = await request(`/admin/attendance-locations/${unassignedLocationId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: `API Test Unassigned Updated ${stamp}`,
        latitude: 17.386,
        longitude: 78.487,
        geofenceRadiusMeters: 650,
        isPrimary: false,
      }),
    });
    assert(
      updatedLocation.status === 200 &&
        updatedLocation.body.location.geofenceRadiusMeters === 650,
      "Attendance-location edit failed",
    );
    const archivedLocation = await request(`/admin/attendance-locations/${unassignedLocationId}/archive`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ archived: true }),
    });
    assert(
      archivedLocation.status === 200 && archivedLocation.body.location.isActive === false,
      "Attendance-location archive failed",
    );
    const restoredLocation = await request(`/admin/attendance-locations/${unassignedLocationId}/archive`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ archived: false }),
    });
    assert(
      restoredLocation.status === 200 && restoredLocation.body.location.isActive === true,
      "Attendance-location restore failed",
    );

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
      phone: "9000000000",
      designation: "Tester",
      department: "Quality",
      password: "employee@123",
      employeeRole: "EMPLOYEE",
      attendanceLocationIds: [locationId, secondLocationId],
    };
    const invalidPhoneEmployee = await request("/admin/employees", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ ...employeeInput, phone: "12345" }),
    });
    assert(
      invalidPhoneEmployee.status === 400 &&
        invalidPhoneEmployee.body.error.code === "VALIDATION_ERROR",
      "Invalid employee phone number was accepted",
    );

    const employee = await request("/admin/employees", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(employeeInput),
    });
    assert(employee.status === 201, "Employee creation failed");
    employeeUserId = employee.body.employee.id;
    assert(
      employee.body.employee.employeeRole === "EMPLOYEE" &&
        employee.body.employee.attendanceLocations.length === 2 &&
        employee.body.employee.attendanceLocations.some((item) => item.id === locationId) &&
        employee.body.employee.attendanceLocations.some((item) => item.id === secondLocationId),
      "Employee role/location response contract is invalid",
    );
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

    const updatedEmployee = await request(`/admin/employees/${employeeUserId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: "API Test Employee Updated",
        email: employeeInput.email,
        phone: "9111111111",
        designation: "Senior Tester",
        department: "Quality",
        employeeRole: "EMPLOYEE",
        attendanceLocationIds: [locationId, secondLocationId],
      }),
    });
    assert(
      updatedEmployee.status === 200 &&
        updatedEmployee.body.employee.fullName === "API Test Employee Updated" &&
        updatedEmployee.body.employee.phone === "9111111111",
      "Administrator employee edit failed",
    );

    const archivedEmployee = await request(`/admin/employees/${employeeUserId}/archive`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ archived: true }),
    });
    assert(
      archivedEmployee.status === 200 && archivedEmployee.body.employee.isActive === false,
      "Employee archive failed",
    );
    const archivedLogin = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identity: employeeInput.employeeId, password: employeeInput.password }),
    });
    assert(archivedLogin.status === 401, "Archived employee was allowed to log in");
    const restoredEmployee = await request(`/admin/employees/${employeeUserId}/archive`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ archived: false }),
    });
    assert(
      restoredEmployee.status === 200 && restoredEmployee.body.employee.isActive === true,
      "Employee restore failed",
    );

    const resetPassword = `reset-${stamp}`;
    const resetCredentials = await request(`/admin/employees/${employeeUserId}/credentials`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ password: resetPassword }),
    });
    assert(resetCredentials.status === 204, "Employee credential reset failed");
    const oldCredentialLogin = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identity: employeeInput.employeeId, password: employeeInput.password }),
    });
    assert(oldCredentialLogin.status === 401, "Old employee credentials remained valid after reset");
    employeeInput.password = resetPassword;

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
        employeeRole: "MANAGER",
        attendanceLocationIds: [],
      }),
    });
    assert(customEmployee.status === 201, "Custom employee ID was rejected");
    assert(
      customEmployee.body.employee.employeeId === `CUSTOM-${stamp}`,
      "Custom employee ID was not preserved",
    );
    assert(
      customEmployee.body.employee.employeeRole === "MANAGER",
      "Manager role was not preserved",
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

    const passwordResetNotifications = await request("/employee/notifications", {
      headers: { Authorization: `Bearer ${employeeLogin.body.accessToken}` },
    });
    const passwordResetNotification = passwordResetNotifications.body.notifications?.find(
      (notification) => notification.type === "PASSWORD_RESET",
    );
    assert(
      passwordResetNotifications.status === 200 &&
        passwordResetNotifications.body.unreadCount >= 1 &&
        passwordResetNotification &&
        !passwordResetNotification.message.includes(employeeInput.password),
      "Secure employee password-reset notification was not created",
    );
    const readPasswordResetNotification = await request(
      `/employee/notifications/${passwordResetNotification.id}/read`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${employeeLogin.body.accessToken}` },
      },
    );
    assert(
      readPasswordResetNotification.status === 200 &&
        readPasswordResetNotification.body.notification.isRead === true,
      "Employee notification read state was not persisted",
    );

    const employeeMe = await request("/auth/me", {
      headers: { Authorization: `Bearer ${employeeLogin.body.accessToken}` },
    });
    assert(employeeMe.status === 200 && employeeMe.body.user.role === "EMPLOYEE", "Employee /me failed");
    assert(
      employeeMe.body.user.employeeProfile?.employeeId === employeeInput.employeeId,
      "Employee /me profile is missing",
    );
    assert(
      employeeMe.body.user.employeeProfile?.attendanceLocations?.length === 2,
      "Employee /me multiple-location contract is missing",
    );

    const selfProfileUpdate = await request("/employee/profile", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${employeeLogin.body.accessToken}` },
      body: JSON.stringify({ fullName: "Employee Self Updated", phone: "9222222222" }),
    });
    assert(
      selfProfileUpdate.status === 200 &&
        selfProfileUpdate.body.user.fullName === "Employee Self Updated" &&
        selfProfileUpdate.body.user.employeeProfile.phone === "9222222222",
      "Employee self-profile edit failed",
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
        initialAttendance.body.sessions.length === 0 &&
        initialAttendance.body.availableLocations.length === 2,
      "Employee attendance overview contains non-database data",
    );

    const outsidePunchIn = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({ latitude: 20.094833, longitude: 74.748011, accuracyMeters: 5 }),
    });
    assert(
      outsidePunchIn.status === 422 && outsidePunchIn.body.error.code === "LOCATION_NOT_RECOGNIZED",
      "An out-of-geofence punch in was accepted",
    );

    const invalidManualPunchIn = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({
        latitude: 20.094833,
        longitude: 74.748011,
        accuracyMeters: 5,
        attendanceLocationId: secondLocationId,
      }),
    });
    assert(
      invalidManualPunchIn.status === 422 &&
        invalidManualPunchIn.body.error.code === "OUTSIDE_GEOFENCE",
      "Manual location selection bypassed the geofence",
    );

    const forbiddenLocationPunchIn = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({
        latitude: 17.385,
        longitude: 78.4867,
        accuracyMeters: 5,
        attendanceLocationId: unassignedLocationId,
      }),
    });
    assert(
      forbiddenLocationPunchIn.status === 422 &&
        forbiddenLocationPunchIn.body.error.code === "ATTENDANCE_LOCATION_NOT_ALLOWED",
      "Employee was allowed to use an unassigned attendance location",
    );

    const punchInResponse = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({
        latitude: 18.52043,
        longitude: 73.856744,
        accuracyMeters: 5,
        attendanceLocationId: secondLocationId,
      }),
    });
    assert(
      punchInResponse.status === 201 &&
        punchInResponse.body.session.status === "IN_PROGRESS" &&
        punchInResponse.body.session.location.id === secondLocationId,
      "A valid in-geofence punch in was not persisted",
    );

    const duplicatePunchIn = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: employeeAuthorization,
      body: JSON.stringify({
        latitude: 19.094833,
        longitude: 74.748011,
        accuracyMeters: 5,
        attendanceLocationId: locationId,
      }),
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
      outsidePunchOut.status === 422 && outsidePunchOut.body.error.code === "LOCATION_NOT_RECOGNIZED",
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
        punchOutResponse.body.session.punchOutReason === "MANUAL" &&
        punchOutResponse.body.session.punchOutLocation.id === locationId,
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
        adminDailyAttendance.body.logs[0].location.id === secondLocationId,
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
    const managerAttendance = await request("/employee/attendance", {
      headers: customAuthorization,
    });
    assert(
      managerAttendance.status === 200 &&
        managerAttendance.body.employeeRole === "MANAGER" &&
        managerAttendance.body.availableLocations.some((item) => item.id === locationId),
      "Manager was not granted access to every active attendance location",
    );
    const customPunchIn = await request("/employee/attendance/punch-in", {
      method: "POST",
      headers: customAuthorization,
      body: JSON.stringify({ latitude: 0, longitude: 0, accuracyMeters: 5 }),
    });
    assert(
      customPunchIn.status === 201 &&
        customPunchIn.body.session.location.id === null &&
        customPunchIn.body.session.location.name === "Current GPS location",
      "Manager coordinate-only punch was not accepted outside configured geofences",
    );
    const storedManagerPunch = await pool.query(
      `SELECT punch_in_latitude, punch_in_longitude, punch_in_accuracy_meters,
              attendance_location_id, punch_in_distance_meters
       FROM attendance_sessions
       WHERE id = $1`,
      [customPunchIn.body.session.id],
    );
    assert(
      Number(storedManagerPunch.rows[0].punch_in_latitude) === 0 &&
        Number(storedManagerPunch.rows[0].punch_in_longitude) === 0 &&
        Number(storedManagerPunch.rows[0].punch_in_accuracy_meters) === 5 &&
        storedManagerPunch.rows[0].attendance_location_id === null &&
        storedManagerPunch.rows[0].punch_in_distance_meters === null,
      "Manager punch coordinates were not stored without a configured location",
    );
    const shiftedAttendance = await pool.query(
      `UPDATE attendance_sessions
       SET attendance_date = CURRENT_DATE - 1,
           punch_in_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
       WHERE id = $1
       RETURNING attendance_date::text`,
      [customPunchIn.body.session.id],
    );
    const shiftedAttendanceDate = shiftedAttendance.rows[0].attendance_date;
    const disabledAutoCheckoutAttendance = await request("/employee/attendance", {
      headers: customAuthorization,
    });
    const disabledAutoCheckoutSession = disabledAutoCheckoutAttendance.body.sessions.find(
      (session) => session.id === customPunchIn.body.session.id,
    );
    assert(
      disabledAutoCheckoutAttendance.status === 200 &&
        disabledAutoCheckoutSession?.status === "COMPLETED" &&
        disabledAutoCheckoutSession.punchOutReason === "MISSED_CHECKOUT",
      "An unclosed session was not classified as a missed checkout at day end",
    );
    await pool.query(
      `UPDATE attendance_sessions
       SET punch_out_at = NULL, punch_out_reason = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [customPunchIn.body.session.id],
    );
    await pool.query(
      `UPDATE work_shifts
       SET auto_checkout_enabled = TRUE, auto_checkout_delay_minutes = 35
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    const autoClosedAttendance = await request("/employee/attendance", {
      headers: customAuthorization,
    });
    const autoClosedSession = autoClosedAttendance.body.sessions.find(
      (session) => session.id === customPunchIn.body.session.id,
    );
    assert(
      autoClosedAttendance.status === 200 &&
        autoClosedSession?.status === "COMPLETED" &&
        autoClosedSession.punchOutReason === "AUTO_SHIFT_END",
      "The configured post-shift auto-checkout did not persist",
    );
    const storedAutoCheckout = await pool.query(
      `SELECT ROUND(EXTRACT(EPOCH FROM (
         sessions.punch_out_at
           - ((sessions.attendance_date + shifts.end_time) AT TIME ZONE shifts.timezone)
       )) / 60)::int AS delay_minutes
       FROM attendance_sessions AS sessions
       JOIN employee_profiles AS profiles ON profiles.user_id = sessions.employee_user_id
       JOIN work_shifts AS shifts ON shifts.id = profiles.shift_id
       WHERE sessions.id = $1`,
      [customPunchIn.body.session.id],
    );
    assert(
      storedAutoCheckout.rows[0].delay_minutes === 35,
      "Automatic checkout did not use the configured post-shift delay",
    );
    const managerAdminLog = await request(
      `/admin/attendance-logs?period=daily&anchorDate=${shiftedAttendanceDate}&search=${encodeURIComponent(`CUSTOM-${stamp}`)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    assert(
      managerAdminLog.status === 200 &&
        managerAdminLog.body.logs[0]?.location.id === null &&
        managerAdminLog.body.logs[0]?.punchIn.distanceMeters === null &&
        managerAdminLog.body.logs[0]?.punchIn.latitude === 0 &&
        managerAdminLog.body.logs[0]?.punchIn.longitude === 0,
      "Manager coordinate-only punch was not available in the administrator report",
    );
    const deletedEmployee = await request(`/admin/employees/${customEmployeeUserId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(deletedEmployee.status === 204, "Permanent employee deletion failed");
    const deletedEmployeeLogin = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identity: `CUSTOM-${stamp}`, password: "employee@123" }),
    });
    assert(deletedEmployeeLogin.status === 401, "Deleted employee was allowed to log in");
    customEmployeeUserId = undefined;

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

    console.log("Integration checks passed: admin auth, employee IDs, admin edit/archive/restore/delete, employee self-edit, employee/manager roles, assigned and manager location access, validated admin shift and auto-checkout customization with audit tracking, employee login, real database attendance logs, admin daily/monthly attendance reports, shift data, location recognition, persisted punch in/out, duplicate prevention, delayed and disabled automatic checkout, password hashing, refresh rotation, validation, conflicts, role authorization, and active-account enforcement.");
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
    if (secondLocationId) {
      await pool.query("DELETE FROM attendance_locations WHERE id = $1", [secondLocationId]);
    }
    if (unassignedLocationId) {
      await pool.query("DELETE FROM attendance_locations WHERE id = $1", [unassignedLocationId]);
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
         SET name = $1, start_time = $2, end_time = $3,
             max_duration_minutes = $4, timezone = $5,
             auto_checkout_enabled = $6, auto_checkout_delay_minutes = $7,
             updated_by = $8
         WHERE id = '00000000-0000-0000-0000-000000000001'`,
        [
          initialShift.name,
          initialShift.start_time,
          initialShift.end_time,
          initialShift.max_duration_minutes,
          initialShift.timezone,
          initialShift.auto_checkout_enabled,
          initialShift.auto_checkout_delay_minutes,
          initialShift.updated_by,
        ],
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
