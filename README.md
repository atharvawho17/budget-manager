# Budget Manager (Full-Stack)

Track income and expenses, set monthly and category budgets, and view reports and charts.
The original single-file frontend now talks to a REST API backed by MySQL instead of `localStorage`.

```
Existing Frontend (HTML/CSS/JS)  -->  REST API  -->  Express.js  -->  MySQL
        public/                       /api/*         server.js        schema.sql
```

**Stack:** HTML/CSS/vanilla JS (`fetch`) · Node.js + Express · MySQL 8 (`mysql2`) · bcrypt · JWT

## Project structure

```
budget-manager/
├── server.js                 # App entry: CORS, JSON parsing, routes, static frontend, error handler
├── schema.sql                # Database + 4 tables (users, user_settings, budgets, transactions)
├── package.json
├── .env.example              # Copy to .env and fill in
├── scripts/init-db.js        # `npm run db:init` - runs schema.sql without the mysql CLI
├── src/
│   ├── config/db.js          # MySQL connection pool + transaction helper
│   ├── constants.js          # Category lists, defaults
│   ├── middleware/
│   │   ├── auth.js           # JWT authentication (sets req.user)
│   │   └── errorHandler.js   # One consistent error format
│   ├── routes/               # auth, transactions, budgets, profile, dashboard, reports, data
│   ├── services/stats.js     # Shared aggregate SQL (totals, category spend, trend)
│   └── utils/                # validate.js, dates.js, token.js, httpError.js, asyncHandler.js
└── public/                   # The frontend (same UI as before)
    ├── index.html
    ├── css/style.css         # unchanged styles
    └── js/app.js             # localStorage logic replaced with fetch() calls
```

## Setup

**Prerequisites:** Node.js 18+ and MySQL 8.0+ (CHECK constraints need 8.0.16+).

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment**
   ```bash
   cp .env.example .env          # Windows: copy .env.example .env
   ```
   Edit `.env`: set `DB_PASSWORD` and a real `JWT_SECRET`. Generate a secret with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
3. **Create the database**
   ```bash
   npm run db:init
   ```
   (or `mysql -u root -p < schema.sql`). This creates the `budget_manager` database - keep `DB_NAME=budget_manager`, or edit the first lines of `schema.sql` to match.
4. **Start the server**
   ```bash
   npm start          # or: npm run dev  (auto-restarts on changes)
   ```
5. **Open the app** at <http://localhost:3000>, click **Register**, and start adding entries.

> Open the app through the server URL above. Opening `public/index.html` directly from disk (`file://`) won't work.
> If you serve the frontend from another origin (e.g. VS Code Live Server on port 5500), add that origin to `CLIENT_ORIGIN` in `.env` and set `window.BUDGET_API_BASE = 'http://localhost:3000/api'` in a `<script>` before `js/app.js`.

## Database design

| Table | Purpose | Keys |
|---|---|---|
| `users` | Account + bcrypt hash + `token_version` | PK `id`, UNIQUE `username` |
| `user_settings` | Display name, total monthly budget (1 row per user) | PK/FK `user_id` → `users.id` |
| `budgets` | Per-category limit | PK `id`, FK `user_id` → `users.id`, UNIQUE (`user_id`,`category`) |
| `transactions` | Income and expense entries | PK `id`, FK `user_id` → `users.id`, indexes on (`user_id`,`txn_date`) and (`user_id`,`type`,`category`) |

All foreign keys use `ON DELETE CASCADE`. Amounts are `DECIMAL(12,2)` with `CHECK` constraints.

## REST API

All endpoints except `register`/`login` require `Authorization: Bearer <token>`.
Errors always look like `{ "error": { "message": "..." } }`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | `{username, password}` → `{token, user}` |
| POST | `/api/auth/login` | `{username, password}` → `{token, user}` |
| POST | `/api/auth/logout` | Revokes all tokens issued to the user |
| GET | `/api/auth/me` | Current user (used to restore a session) |
| GET | `/api/transactions` | List yours (optional `type`, `category`, `from`, `to`, `limit`) |
| POST | `/api/transactions` | `{type, description, amount, category, date}` |
| GET | `/api/transactions/:id` | One transaction |
| DELETE | `/api/transactions/:id` | Delete one of your transactions |
| GET | `/api/budgets?month=YYYY-MM` | Monthly budget + category limits and spend |
| PUT | `/api/budgets/monthly` | `{amount}` |
| PUT | `/api/budgets/categories/:category` | `{limit}` |
| GET | `/api/profile` | Username, display name |
| PUT | `/api/profile` | `{displayName}` |
| PUT | `/api/profile/password` | `{newPassword, currentPassword?}` → new token |
| GET | `/api/dashboard?month=YYYY-MM` | Totals, savings %, month spend, category spend |
| GET | `/api/reports?month=YYYY-MM` | Category table, summary, 6-month trend, income by source |
| GET | `/api/data/export` | Download all your data as JSON |
| POST | `/api/data/import` | Replace your data from a JSON file |
| GET | `/api/health` | DB connectivity check |

Quick test with curl:
```bash
curl -X POST localhost:3000/api/auth/register -H "Content-Type: application/json" \
     -d '{"username":"demo","password":"secret123"}'
# copy the token from the response, then:
curl localhost:3000/api/dashboard -H "Authorization: Bearer <token>"
```

## Security notes

- **Passwords:** hashed with bcrypt (12 rounds by default, `BCRYPT_ROUNDS`); never stored or returned in plain text. Login uses a generic error message and does a dummy hash comparison for unknown usernames.
- **JWT:** signed with `JWT_SECRET` (HS256, expiry `JWT_EXPIRES_IN`). The middleware also checks the user still exists and that the token's `token_version` matches the database, so **logout and password change revoke old tokens** (this signs the user out on all devices).
- **Data isolation:** every query includes `user_id = req.user.id` taken from the verified token, never from the request body or URL.
- **SQL injection:** all queries are parameterised (`?` placeholders with `mysql2` prepared statements).
- **Validation:** types, amounts, dates, categories, lengths and ids are validated server-side before touching the database.
- **Other:** CORS allow-list (`CLIENT_ORIGIN`), rate limiting on register/login, 5 MB body limit, no stack traces sent to clients.
- **Known trade-off:** the JWT is kept in `localStorage` so a refresh keeps you signed in. That's standard for a student project; a production app would typically use an httpOnly cookie.

## Behaviour notes

- Importing a JSON file **replaces** your transactions and budgets (same as the original app). Files exported from the old localStorage version can be imported.
- The "This month's spending" bar uses the current month; category budget bars compare each limit against that category's total spending, as in the original app.
- The change-password form has only a "new password" field (UI unchanged). The API also accepts an optional `currentPassword` and verifies it when sent.

## Troubleshooting

- **`Could not connect to MySQL`** - check `DB_*` in `.env`, that MySQL is running, and that you ran `npm run db:init`.
- **`JWT_SECRET is missing`** - set a real value in `.env`.
- **`bcrypt` fails to install (build errors, mostly on Windows)** - run `npm install bcryptjs`, then change `require('bcrypt')` to `require('bcryptjs')` in `src/routes/auth.js` and `src/routes/profile.js`. The API is identical.
- **`ER_NOT_SUPPORTED_AUTH_MODE`** - use a MySQL 8 user with `mysql_native_password`, or update `mysql2`.


## Quick live deployment (Railway)

This project is configured to run as one web service, with MySQL supplied by Railway.

1. Push this `budget-manager` folder to a GitHub repository.
2. In Railway, create a new project and deploy the GitHub repository.
3. Add a **MySQL** service to the same Railway project.
4. In the web service variables, map the MySQL service values to:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
5. Add:
   - `NODE_ENV=production`
   - `JWT_SECRET=<long random secret>`
   - `JWT_EXPIRES_IN=7d`
   - `BCRYPT_ROUNDS=12`
   - `CLIENT_ORIGIN=https://<your-railway-domain>`
6. Run the database initialization once with `npm run db:init` using the Railway MySQL connection variables.
7. Generate a Railway public domain for the web service.
8. Open the generated HTTPS URL. The frontend and API are served by the same Express application, so no separate frontend deployment is required.

Important: do not commit `.env` or database credentials to GitHub.
