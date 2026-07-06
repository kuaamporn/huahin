# HuaHin Property Management System — Full Context

## What this is

A live, deployed **Employee Check-In + Property Management system** for two
properties in Hua Hin, Thailand: **The Precious** (86 rooms) and **The Moment**
(81 units). Built on Cloudflare Workers + D1 + GitHub Pages, zero monthly cost.

---

## Live infrastructure

| Component | Value |
|---|---|
| Cloudflare Worker | `huahin-api` |
| Worker URL | `https://huahin-api.huahin.workers.dev` |
| D1 database | `huahin-db` — ID `4477b947-edac-44f5-9078-8ae7beada89d` |
| D1 database | `huahin-db` — ID `4477b947-edac-44f5-9078-8ae7beada89d` |
| Old DB (backup) | `checkin-db` — ID `0eb0e25a-32b1-4445-9071-e087c354a344` (retired) |
| GitHub repo | `kuaamporn/huahin` (public, GitHub Pages enabled) |
| Check-in page | `https://kuaamporn.github.io/huahin/` |
| Rooms board | `https://kuaamporn.github.io/huahin/rooms.html` |
| Finance page | `https://kuaamporn.github.io/huahin/finance.html` |
| HR dashboard | `https://kuaamporn.github.io/huahin/hr.html` |
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
| technician | no | no | no | no | no |
| revenue | no | no | yes | no | no |
| expense | no | no | no | yes | no |
| accountant | no | no | no | no | yes |

Admin (is_admin=1) controls attendance features. Roles control rooms/finance features.

---

## Room operational status (5 colors)

Computed, not stored as a single column:

| Status | Color | Source |
|---|---|---|
| Vacant | Green | Derived — no booking covers today |
| Occupied | Red | Derived — active booking covers today |
| Cleaning Due | Brown | Override (one-time request) OR auto for walk-in bookings |
| Maintenance | Orange | Override — room out of service for repair / fixing |
| Closed | Black | Manual override — cannot be set while booking active (must move tenant first) |

Priority: Closed > Maintenance > Cleaning Due > Occupied > Vacant.

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

### Room Status / Housekeeping / Maintenance
- `roomsGetStatusGrid`, `housekeepingGetTasks`, `housekeepingGetReport`, `employeeGetTasks`
- `roomsRequestCleaning`, `roomsMarkCleaned`
- `roomsClose`, `roomsReopen`, `roomsMoveTenant`
- `roomsStartMaintenance`, `roomsResolveMaintenance`, `roomsListOverrides`

---

## Frontend pages

| File | Purpose | Access (role-gated) |
|---|---|---|
| `index.html` | Login + employee check-in (QR scan + geofence) + dynamic Task list (Housekeeper/Technician) | Public (only page with login form) |
| `session.js` | Shared sessionStorage helper — login once, session shared across all pages | Included by all pages |
| `rooms.html` | Gantt-style room availability board (light theme, booking CRUD, closed/maintenance blocks, stats) | owner, frontdesk |
| `finance.html` | Standalone finance page (revenue/expense entry, monthly summary, CSV export) | owner, accountant, revenue, expense |
| `billing.html` | Monthly billing — batch invoice generation with editable utility rates and extras modal | owner, accountant, revenue |
| `batch-invoice.html` | Multi-invoice A4 print page (batch print after generating invoices) | owner, accountant, revenue |
| `invoice.html` | Single A4 printable invoice slip | owner, accountant, revenue |
| `hr.html` | HR dashboard (attendance, monthly report, employees, roles management) | owner only |
| `dashboard.html` | Finance dashboard with Chart.js doughnut charts | owner only |
| `hk-report.html` | Housekeeping KPI report — tasks scheduled vs completed, compliance rate, search/filter | owner, frontdesk |

### Session flow
- Login happens **once** on `index.html` — session saved to `sessionStorage`
- After login, roles are fetched via `adminListEmployeesWithRoles` and stored in session
- Nav links (Rooms / Finance / HR) appear based on user's roles
- Other pages read the shared session — no second login prompt
- Direct-navigating without session or without required role redirects to `index.html`
- Session cleared on tab close (sessionStorage, not localStorage — intentional)
- Sign out from any page clears session for all pages

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
8. **Deployed** merged worker to `https://huahin-api.huahin.workers.dev`
9. **Created** GitHub repo `kuaamporn/huahin` with GitHub Pages enabled
10. **Pushed** all three frontend files (index.html, rooms.html, hr.html)
11. **Kept** old `checkin-db` as backup
12. **Added Finance tab** to dashboard — monthly summary cards (revenue/expense/net), transaction list, add revenue/expense modal with correct param order, search filter, CSV export
13. **Added Roles tab** to dashboard — list employees with roles, edit roles modal (grant/revoke via checkboxes)
14. **Permission gating** — Finance tab visible only to owner/accountant/revenue/expense roles; Roles tab visible only to owner; add buttons gated per role; roles fetched after login via `adminListEmployeesWithRoles`
15. **Shared session** — created `session.js` (sessionStorage-based), login happens once on `index.html`, session shared across all pages
16. **Split Finance** into standalone `finance.html` (removed Finance tab from hr.html)
17. **Removed duplicate login screens** from `rooms.html` and `hr.html` — both now use shared session with role gating (rooms: owner/frontdesk; hr: owner)
18. **Role-gated nav links** on `index.html` — Rooms (owner/frontdesk), Finance (owner/accountant/revenue/expense), HR (owner) — hidden by default, shown after roles are fetched
19. **Fixed finance.html room field** — replaced free-text input with search-combo dropdown that only offers real room IDs from D1, preventing `FOREIGN KEY constraint failed` errors from mistyped room codes (e.g. "P110" vs real "P-110")
20. **Fixed finance.html API params** — `roomsList`/`bookingsList` calls were passing `session.token` as first param but these actions take only propertyId (no token); removed the erroneous token param
21. **Finance modal UX upgrade** — 2-column wider layout (640px), auto-fills guest name from active booking, "Walk-in / no room" option for transactions without a room on file
22. **Fixed rooms.html RangeError** — `var TODAY` was hoisted but `undefined` when `bootApp()` ran synchronously after the session check; reordered all date variables and utility functions (`TODAY`, `WIN_S`, `WIN_E`, `dk()`, `pd()`, `dd()`, etc.) before the session check that calls `bootApp()`
23. **Fixed Gantt table disappearing on date filter** — availability chips were stacking vertically (block-level divs), pushing Gantt table off screen; added `max-height: 120px` + `overflow-y: auto` on `.avres`, and flexbox wrap on `#avchips` so chips flow horizontally

---

## Hotfixes applied (2026-06-25)

- **V5 — Move-Out ISE:** `financeProcessMoveOut` used `new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' })` which throws in Cloudflare Workers runtime. Fixed to use existing `todayThaiDateString()` + `billingMonthFromDate()` helpers.
- **V6a — Move-Out column mismatch:** Revenue INSERT in `financeProcessMoveOut` was missing `payment_channel`, `transfer_ref`, `notes` columns — caused DB error when deductions present. Added explicit NULL bindings.
- **V6b — Error visibility:** Cleaned up nested try/catch in `financeProcessMoveOut` to return `"Database Error: " + err.message` instead of generic ISE.
- **V6c — Tasks Today/Tomorrow:** `employeeGetTasks` now fetches both today's and tomorrow's status grids. Frontend `index.html` renders a 2-column Today/Tomorrow layout for housekeeping tasks.
- **V7 — Move-Out unit_price constraint:** Deposit return `transaction_items` INSERT was missing `units` and `unit_price` columns (NOT NULL in schema). Added `units=1, unit_price=amount` to fix the DB constraint error.
- **DB Migration:** Migrated from `checkin-db` to `huahin-db` (`4477b947-edac-44f5-9078-8ae7beada89d`). All data exported and imported. Worker redeployed with new binding. Old `checkin-db` kept as backup.
- **Worker Rename:** Renamed Cloudflare Worker from `employee-checkin-api` to `huahin-api`. New URL: `https://huahin-api.huahin.workers.dev`. Updated all frontend pages and documentation. Old worker still exists — delete manually after verification.
- **Monthly Billing & Invoice:** New `meter_readings` table, `billing.html` for batch invoice generation with meter reading grid, `invoice.html` for A4 printable invoice slips. Three new API actions: `billingGetActiveRooms`, `billingGenerateInvoices`, `financeGetTransaction`. Print Invoice button added to Finance edit modal. Billing nav link added to all pages (owner/accountant/revenue).
- **Billing error handling:** Added `.catch()` and non-JSON response detection to `apiCall()` in billing.html — network/server errors now display on screen instead of silently hanging.
- **Billing token fix (2026-06-26):** Fixed `HuaHinSession.getToken()` (non-existent function) to `HuaHinSession.getSession()` in both Load and Generate handlers — was causing "Loading..." hang.
- **Billing improvements (2026-06-26):** Editable electricity/water rates per room (no longer hardcoded 8/22), multiple extra line items via modal (description, category, units, unit price), `min="0"` on all inputs, backend returns `txnIds` for batch printing. New `batch-invoice.html` page for printing all generated invoices at once with CSS page breaks.
- **XSS hotfix (2026-06-26):** Added `escapeHtml()` to `batch-invoice.html` and wrapped all user-sourced values. Fixed HTML attribute injection in `billing.html` extras modal — description now set via `.value` property instead of innerHTML. Added ฿ symbol to batch invoice grand total.
- **Duplicate invoice guard (2026-06-26):** `billingGenerateInvoices` now checks for existing rent transactions for the same rooms/month before creating new ones. Returns descriptive error listing which rooms already have invoices.
- **Pending invoices workflow (2026-06-26):** New `status` column on transactions (`'pending'`/`'paid'`). Generated billing invoices start as pending — hidden from Finance ledger and monthly summary. Billing page shows yellow pending banners with Confirm Paid (payment channel modal) and Delete buttons. New APIs: `billingConfirmPayment`, `billingDeleteInvoice`. `invoice.html` token bug fixed + `.catch()` added.
- **UI fixes (2026-06-26):** Fixed billing render crash (`calcRow()` called before DOM append), finance dropdown click-through (`event.stopPropagation()`), standardized payment channels to Cash/KB/SCB/Mae Manee/Kshop across all pages.
- **Bento Box UI overhaul (2026-06-26):** Apple-style Bento design across all 5 pages — updated color tokens (`#1D1D1F` ink, `#F5F5F7` paper, `#E5E5EA` line, `#86868B` muted), 24px card radii with hover scale transitions, CSS grid stats, 12px input/button radii, 16px table radii, softer modal shadows.
- **Features & fixes (2026-06-26):** Renamed `billingDeleteInvoice` → `financeDeleteTransaction` (owner-only). Delete button in Finance ledger for owners. Color-coded payment channel emojis (🟢 KB, 🟣 SCB, 🟪 Mae Manee, 🟩 Kshop). Fixed billing signout (moved handler into `window.onload`). Added Cleaning category to billing extras modal.
- **Draft extensions & HR/Tasks (2026-06-26):** `billingGenerateInvoices` auto-creates `monthly-draft` bookings extending to month end (dashed blue Gantt bar). `billingConfirmPayment` converts drafts to confirmed monthly. Technician role added to HR roles modal. Task list on index.html split into Remaining/Overdue, Today, and Tomorrow sections.
- **Delete transaction bugfix (2026-06-26):** `financeDeleteTransaction` was crashing due to querying non-existent `active` column on `employee_roles`. Fixed to use `getEmployeeRoles()` helper. Now also cleans up orphaned `monthly-draft` bookings when deleting a transaction.
- **Selective invoice checkboxes (2026-06-26):** Billing table now has per-room checkboxes with Select All toggle. Only checked rooms are included in invoice generation. Generate button disabled when none checked.
- **Batch invoice redesign (2026-06-28):** Rewritten to output 3 compact invoice slips per A4 page with bank transfer details, matching the Thai property invoice format.
- **Finance Dashboard (2026-06-28):** New `dashboard.html` with Chart.js doughnut charts for revenue/expense breakdown by category. Owner-only. New `dashboardGetStats` API. Navigation split: "Dashboard" + "HR" links replace single "HR" link across all pages.
- **Customer profiles (2026-06-28):** New `customers` table. CRUD APIs (`roomsGetCustomers`, `roomsAddCustomer`, `roomsUpdateCustomer`, `roomsDeleteCustomer`). Bookings link to `customer_id` column. Early move-out feature via `roomsEarlyMoveOut`.
- **Receipt generation (2026-06-28):** New `receipts` table with Buddhist-year numbered receipts (RD/RR/RA prefix). `financeGenerateReceipt` and `financeGetReceipt` APIs. Chronological numbering enforcement.
- **Vendor list management (2026-06-27):** New `vendors` table (name, address, tax_id, branch). `financeGetVendors` now returns structured objects. Added `financeAddVendor`, `financeUpdateVendor`, `financeDeleteVendor` APIs (owner/expense). Manage Vendors modal in finance.html with add/edit/delete UI.
- **Overdue tasks date fix (2026-06-27):** `employeeGetTasks` now preserves original `appliesDate` for housekeeping and `created_at` for technician tasks instead of forcing today/tomorrow. Overdue tasks correctly appear in the Remaining/Overdue section. Date badge added to task UI.
- **Dynamic finance categories (2026-06-27):** `financeUpdateSetting` API (owner-only). Revenue/expense categories loaded from `settings` table. Categories modal for owners. Item row always shows Qty/Units and Unit Price. Amount field fix (no longer resets to 0). Default units=1.
- **Task dedup + daily clean (2026-06-27):** `computeRoomStatus` triggers CLEANING_DUE for all non-monthly bookings (was walkin only). Task deduplication via Set to prevent same overdue task appearing twice.
- **Responsive design (2026-06-28):** All frontend pages now mobile-responsive. Viewport meta tags added to index, finance, hr, billing, invoice, batch-invoice. Media queries stack toolbars/navbars/form grids vertically on screens ≤768px. Data tables wrapped in scrollable containers.
- **Nav redesign (2026-06-29):** All pages restructured with 2-row header (title+signout / nav links). Sign-out styled as red pill badge. Nav links flex-wrap for mobile. HK Report link added (owner/frontdesk).
- **Housekeeping Report (2026-06-29):** New `hk-report.html` with KPI cards (total/remaining/completed/rate), date range filter, property/status/search filters, task table with cleaned-at timestamps and cleaner names. `housekeepingGetReport` API. `housekeepingGetRemainingTasks` helper refactored `employeeGetTasks`.
- **Daily cleaning logic fix (2026-06-29):** `computeRoomStatus` generates CLEANING_DUE from checkin+1 through checkout (all stay nights + checkout day). Covers Walk-in, Booking.com, Expedia.
- **Billing editable rent (2026-06-29):** Rent column in billing grid is now editable for manual pro-rating before invoice generation.
- **Billing pending fix (2026-06-29):** `billingGetActiveRooms` queries both `monthly` and `monthly-draft` bookings — restores pending invoice cards.
- **Auto-extension fix (2026-06-29):** No longer converts active booking to `monthly-draft`. Extension checkout = exactly 1 month from check-in (preserves billing cycle). `billingConfirmPayment` only converts the draft overlapping the transaction's billing month.
- **Move Room / Early Move-out UI (2026-06-29):** Restored buttons in rooms.html sidebar for monthly tenants. Move Room modal with room selector, new rate, reason. `roomsMoveTenant` now accepts `newRate`, calculates pro-rated charge difference, auto-creates pending finance transaction for upgrades. Preserves `customer_id`.

---

## What's NOT built yet (potential next steps)

- **Automated cleaning schedule configuration** — custom schedules (e.g., clean every 3 days) instead of daily auto walk-in check cleanings.
- **Detailed HR check-in map visualizations** — showing checking coordinate positions on a map overlay.
