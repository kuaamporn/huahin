# HuaHin Property Management System — Full Context

## What this is

A live, deployed **Employee Check-In + Property Management system** for two
properties in Hua Hin, Thailand: **The Precious** (86 rooms) and **The Moment**
(81 units). Built on Cloudflare Workers + D1 + GitHub Pages, zero monthly cost.

---

## Live infrastructure

| Component | Value |
|---|---|
| Cloudflare Worker | `employee-checkin-api` |
| Worker URL | `https://employee-checkin-api.huahin.workers.dev` |
| D1 database | `huahin-db` — ID `4477b947-edac-44f5-9078-8ae7beada89d` |
| Old DB (backup) | `checkin-db` — ID `0eb0e25a-32b1-4445-9071-e087c354a344` |
| GitHub repo | `kuaamporn/huahin` (public, GitHub Pages enabled) |
| Check-in page | `https://kuaamporn.github.io/huahin/` |
| Rooms board | `https://kuaamporn.github.io/huahin/rooms.html` |
| HR dashboard | `https://kuaamporn.github.io/huahin/dashboard.html` |
| Admin login | username: `admin` (password set via bootstrap-admin.js) |

---

## API contract

Single endpoint. Every request is `POST` with body `{ action: string, params: [...] }`.
**Not** REST routes. All actions are listed in the `ACTIONS` map in `worker.js`.

Auth: client hashes password with SHA-256 first, server salts + does 5000 rounds
of SHA-256 on top. Session token lives 12 hours.

---

## Database tables (12 total)

### Original (employee check-in system)
| Table | Purpose |
|---|---|
| `employees` | Staff accounts (employee_id, name, username, password_hash, salt, is_admin, active, role) |
| `offices` | Office locations with geofence (lat, lng, radius_meters). Seeded: "The Precious Office" |
| `logs` | Check-in/out records with GPS, anomaly flags |
| `sessions` | Auth tokens (12-hour TTL) |
| `attendance_overrides` | Admin manual attendance overrides (vacation, medical leave, etc.) |

### Rooms addon
| Table | Purpose |
|---|---|
| `properties` | Two rows: `precious`, `moment` |
| `rooms` | 167 rooms with room_id, floor, room_type, rate |
| `bookings` | Guest bookings with conflict detection, soft-cancel |

### Roles & finance addon
| Table | Purpose |
|---|---|
| `employee_roles` | Many-to-many join table — one employee can hold multiple roles |
| `transactions` | Revenue (IN) and expenses (OUT), categorized, with billing_month |

### Room status addon
| Table | Purpose |
|---|---|
| `room_status_overrides` | CLEANING_DUE and CLOSED flags on rooms |
| `room_moves` | Audit trail for tenant relocations (move-then-close flow) |

---

## Room inventory

### The Precious — 86 rooms, property_id = `precious`

| Floor | Count | Type | Rate (THB/mo) | Room IDs |
|---|---|---|---|---|
| G | 1 | House | 12,000 | P-G01 |
| 1 | 10 | Standard | 4,500 | P-101 – P-110 |
| 2 | 13 | Standard | 5,000 | P-201 – P-213 |
| 3 | 13 | Standard | 6,000 | P-301 – P-313 |
| 4 | 13 | Standard | 6,500 | P-401 – P-413 |
| 5 | 13 | Standard | 7,500 | P-501 – P-513 |
| 6 | 13 | Standard | 7,500 | P-601 – P-613 |
| 7 | 5 + 4 | Standard + Deluxe | 7,500 / 15,000 | P-701 – P-709 |
| 8 | 1 | Penthouse | 20,000 | P-801 |

Daily rates: Standard 650, Deluxe 1,500, Penthouse 2,000, House: not sold daily.

### The Moment — 81 units, property_id = `moment`

| Floor | Count | Types | Rates (THB) | Room IDs |
|---|---|---|---|---|
| 1 (G) | 2 | Commercial | 20,000/mo | M-C1, M-C2 |
| 2 | 7+1+1 | A.2 + B + C | 7,000 / 10,000 / 12,000 (monthly) | M-201 – M-209 |
| 3 | 12+1+1 | A.2 + B + C | 7,000 / 10,000 / 12,000 (monthly) | M-301 – M-314 |
| 4 | 12+1+1 | A.2 + B + C | 7,000 / 10,000 / 12,000 (monthly) | M-401 – M-414 |
| 5 | 12+1+1 | A.2 + B + C | 7,000 / 10,000 / 12,000 (monthly) | M-501 – M-514 |
| 6 | 12+1+1 | A.1 + B + C | 900 / 1,200 / 1,200 (daily) | M-601 – M-614 |
| 7 | 12+1+1 | A.1 + B + C | 900 / 1,200 / 1,200 (daily) | M-701 – M-714 |

Room types: A.1 = Studio Daily, A.2 = Studio Monthly, B = 1-Bedroom, C = Deluxe.
Breakfast add-on: +400 THB/day.

---

## Staff roles & permissions

Multi-role system via `employee_roles` join table. One employee can hold
multiple roles simultaneously (e.g. frontdesk + revenue + expense).

| Role | addBooking | cancelBooking | addRevenue | addExpense | viewFinance |
|---|---|---|---|---|---|
| owner | yes | yes | yes | yes | yes |
| frontdesk | yes | no | no | no | no |
| housekeeping | no | no | no | no | no |
| revenue | no | no | yes | no | no |
| expense | no | no | no | yes | no |
| accountant | no | no | no | no | yes |

Admin (is_admin=1) controls attendance features. Roles control rooms/finance features.

---

## Room operational status (4 colors)

Computed, not stored as a single column:

| Status | Color | Source |
|---|---|---|
| Vacant | Green | Derived — no booking covers today |
| Occupied | Red | Derived — active booking covers today |
| Cleaning Due | Brown | Override (one-time request) OR auto for walk-in bookings |
| Closed | Black | Manual override — cannot be set while booking active (must move tenant first) |

Priority: Closed > Cleaning Due > Occupied > Vacant.

Overdue cleaning: a request never marked done persists on every day's view
until `roomsMarkCleaned` is called.

---

## All API actions

### Attendance (original)
- `login`, `logout`, `checkIn`, `listOffices`, `changeOwnPassword`
- `adminAddEmployee`, `adminDeactivateEmployee`, `adminResetPassword`
- `adminAddOffice`, `adminListEmployees`
- `dashboardGetToday`, `dashboardGetFlaggedHistory`
- `dashboardGetAttendance`, `dashboardGetMonthlyReport`
- `adminSetAttendanceOverride`, `adminClearAttendanceOverride`, `adminListAttendanceOverrides`

### Rooms / Bookings
- `roomsList`, `bookingsList`, `roomsAddBooking`, `roomsCancelBooking`, `roomsGetStats`

### Roles / Finance
- `adminGrantRole`, `adminRevokeRole`, `adminListEmployeesWithRoles`
- `financeAddRevenue`, `financeAddExpense`, `financeGetMonthlySummary`, `financeListTransactions`

### Room Status / Housekeeping
- `roomsGetStatusGrid`, `housekeepingGetTasks`
- `roomsRequestCleaning`, `roomsMarkCleaned`
- `roomsClose`, `roomsReopen`, `roomsMoveTenant`

---

## Frontend pages

| File | Purpose | Notes |
|---|---|---|
| `index.html` | Employee check-in | QR scan + geofence, link to rooms.html |
| `rooms.html` | Gantt-style room availability board | Dark theme, booking CRUD, stats bar |
| `dashboard.html` | HR attendance + finance + roles dashboard | Admin-only, today's logs, attendance, monthly report, employees, finance (revenue/expense), roles management |

All use the same `callApi()` pattern and `clientHashPassword()` for login.

---

## What was done in this session

1. **Studied** the deployed check-in system (`0.Check-in/`) and the handoff repo from Claude Chat
2. **Merged** three worker files into one deployable `worker.js`:
   - Original attendance + rooms addon (already in worker.js)
   - Multi-role permissions + finance addon (`worker-roles-and-finance-addon.js`)
   - Room status/housekeeping addon (`worker-room-status-addon.js`)
   - Fixed call sites: `getEmployeeRole()` → `getEmployeePermissions()`
   - Removed old `ROOM_ROLE_PERMISSIONS` / `getEmployeeRole()`
   - Merged all ACTIONS into one map
3. **Generated** `db/seed-rooms.sql` with all 167 rooms and confirmed rates
4. **Created** new D1 database `huahin-db` (`4477b947-edac-44f5-9078-8ae7beada89d`)
5. **Ran** all migrations (schema.sql + 3 addon schemas) and room seed on `huahin-db`
6. **Bootstrapped** admin account and set owner role
7. **Updated** `wrangler.toml` to point to `huahin-db`
8. **Deployed** merged worker to `https://employee-checkin-api.huahin.workers.dev`
9. **Created** GitHub repo `kuaamporn/huahin` with GitHub Pages enabled
10. **Pushed** all three frontend files (index.html, rooms.html, dashboard.html)
11. **Kept** old `checkin-db` as backup
12. **Added Finance tab** to dashboard — monthly summary cards (revenue/expense/net), transaction list, add revenue/expense modal with correct param order, search filter, CSV export
13. **Added Roles tab** to dashboard — list employees with roles, edit roles modal (grant/revoke via checkboxes)
14. **Permission gating** — Finance tab visible only to owner/accountant/revenue/expense roles; Roles tab visible only to owner; add buttons gated per role; roles fetched after login via `adminListEmployeesWithRoles`

---

## What's NOT built yet (potential next steps)

- **Room status board UI** — `roomsGetStatusGrid` and housekeeping actions exist but `rooms.html` only shows the Gantt booking view, not the 4-color status grid
- **Housekeeping page** — `housekeepingGetTasks`, `roomsRequestCleaning`, `roomsMarkCleaned` are backend-ready but have no UI
- **Move tenant UI** — `roomsMoveTenant` action works but no frontend flow for it
- **Close/reopen room UI** — `roomsClose`/`roomsReopen` work but need frontend buttons
