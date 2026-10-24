# Windworld backend

Express and PostgreSQL API for Windworld administrator and employee authentication, employee management, and attendance-location setup.

## Local setup

1. Copy `.env.example` to `.env` and replace both JWT secrets.
2. Ensure PostgreSQL is running and the configured database user can create databases.
3. Run `npm install`.
4. Run `npm run db:setup` to create `windworld`, apply migrations, and seed the administrator.
5. Run `npm run dev`.

The administrator seed is controlled by `ADMIN_SEED_*`. Running it again synchronizes the seeded administrator, including the password, and reactivates the account.

## Authentication

- `POST /api/auth/login` accepts `{ "identity": "...", "password": "..." }` and signs in either an administrator or employee. An employee can use their work email or employee ID.
- `POST /api/auth/admin/login` accepts the same body but only permits the `ADMIN` role. This compatibility endpoint is retained for the existing administrator UI.
- `POST /api/auth/refresh` accepts `{ "refreshToken": "..." }` and rotates a valid refresh token.
- `POST /api/auth/logout` accepts `{ "refreshToken": "..." }` and revokes it.
- `GET /api/auth/me` returns the current active user for either role. Employee responses include their employee role and assigned attendance locations.

Access tokens expire after one day by default. Refresh tokens expire after seven days, are rotated on use, and are stored only as SHA-256 hashes. Passwords are hashed using bcrypt with cost 12. Protected requests reload the user from PostgreSQL so a deactivated account or changed role takes effect without waiting for access-token expiry.

## Administrator APIs

All endpoints below require an active `ADMIN` bearer access token.

### Employees

- `GET /api/admin/employees?search=&limit=50&offset=0` returns `{ "employees": [...], "summary": { "total": 0, "active": 0 } }`.
- `POST /api/admin/employees` creates both the login and employee profile in one transaction and returns `{ "employee": {...} }` with status `201`.
- `PATCH /api/admin/employees/:employeeUserId` updates identity, work details, role, and location assignments.
- `PATCH /api/admin/employees/:employeeUserId/archive` accepts `{ "archived": true | false }`. Archiving disables login and revokes refresh sessions without deleting attendance history.
- `DELETE /api/admin/employees/:employeeUserId` permanently deletes the employee and their dependent attendance records.

Example request:

```json
{
  "fullName": "Ananya Deshmukh",
  "employeeId": "EMP-1043",
  "email": "ananya@windworld.com",
  "phone": "9876543210",
  "designation": "Site Engineer",
  "department": "Operations",
  "password": "employee-password",
  "employeeRole": "EMPLOYEE",
  "attendanceLocationIds": ["location-uuid", "another-location-uuid"]
}
```

`employeeRole` is either `EMPLOYEE` or `MANAGER`. Employees require at least one active assigned location and may punch only inside one of those geofences. Managers have no geofence restriction and can punch without a configured location; their GPS coordinates and accuracy are stored for reporting.

Email and employee-ID collisions return `409` with stable error codes. Passwords must contain at least eight characters and must not exceed bcrypt's 72-byte input limit. Phone numbers are optional, but when provided they must contain exactly 10 digits with no country code, spaces, or punctuation.

Employees can update their own full name and phone number through `PATCH /api/employee/profile`. Work email, designation, department, role, status, and attendance locations remain administrator-controlled.

### Attendance locations

- `GET /api/admin/attendance-locations` returns `{ "locations": [...] }`. Pass `includeInactive=true` when inactive records are also needed.
- `POST /api/admin/attendance-locations` creates a location and returns `{ "location": {...} }` with status `201`.

Example request:

```json
{
  "name": "Headquarters Office",
  "latitude": 19.094833,
  "longitude": 74.748011,
  "wifiIp": "192.0.2.10",
  "geofenceRadiusMeters": 500,
  "isPrimary": true
}
```

Coordinates, IP address, and radius are validated. Setting a new active primary location atomically clears the previous primary.

### Attendance settings

- `GET /api/admin/settings` returns the active general shift configuration.
- `PATCH /api/admin/settings/shift` updates the shift name, start time, end time, maximum duration, and IANA timezone.

The update validates 24-hour times, requires the end time to be later than the start time, limits duration to 30–1440 minutes and to the scheduled window, verifies the timezone against PostgreSQL, and records the administrator who made the change. Saved values immediately drive punch availability, late detection, attendance reports, and automatic checkout.

## Database commands

- `npm run db:create`
- `npm run db:migrate`
- `npm run db:seed:admin`
- `npm run db:setup`

The migration runner applies the legacy migrations in `src/migrations` and all new deployment migrations in `db/migrations`, in filename order. Migration `007_add_employee_roles_and_multiple_locations.sql` preserves existing single-location assignments while enabling multiple assignments and employee/manager roles; migration `009_allow_manager_coordinate_only_punches.sql` enables coordinate-only manager punches; migration `010_add_shift_update_audit.sql` tracks the administrator who last changed the shift policy.

Run `npm run check` for backend JavaScript syntax validation. With the migrated local database and seeded administrator available, run `npm run test:integration` for the focused API integration check; it creates and removes isolated test records. Never commit `.env` or use local development secrets in production.
