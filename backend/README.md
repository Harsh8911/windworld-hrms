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
- `GET /api/auth/me` returns the current active user for either role. Employee responses include their employee profile and assigned attendance location.

Access tokens expire after 15 minutes by default. Refresh tokens expire after seven days, are rotated on use, and are stored only as SHA-256 hashes. Passwords are hashed using bcrypt with cost 12. Protected requests reload the user from PostgreSQL so a deactivated account or changed role takes effect without waiting for access-token expiry.

## Administrator APIs

All endpoints below require an active `ADMIN` bearer access token.

### Employees

- `GET /api/admin/employees?search=&limit=50&offset=0` returns `{ "employees": [...], "summary": { "total": 0, "active": 0 } }`.
- `POST /api/admin/employees` creates both the login and employee profile in one transaction and returns `{ "employee": {...} }` with status `201`.

Example request:

```json
{
  "fullName": "Ananya Deshmukh",
  "employeeId": "EMP-1043",
  "email": "ananya@windworld.com",
  "phone": "+91 98765 43210",
  "designation": "Site Engineer",
  "department": "Operations",
  "password": "employee-password",
  "attendanceLocationId": "optional-location-uuid"
}
```

Email and employee-ID collisions return `409` with stable error codes. Passwords must contain at least eight characters and must not exceed bcrypt's 72-byte input limit.

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

## Database commands

- `npm run db:create`
- `npm run db:migrate`
- `npm run db:seed:admin`
- `npm run db:setup`

Run `npm run check` for backend JavaScript syntax validation. With the migrated local database and seeded administrator available, run `npm run test:integration` for the focused API integration check; it creates and removes isolated test records. Never commit `.env` or use local development secrets in production.
