# What to Eat — frontend

React 19 + TypeScript + Vite single-page app for the FastAPI backend in `../app`.
Plain CSS (design tokens in `src/index.css`), React Router 7, no UI library.

## Run locally

```bash
# 1. Backend (from the project root, one-time venv setup)
python3 -m venv .venv
.venv/bin/pip install -r app/requirements-api.txt
mkdir -p .localdata
DATABASE_URL="sqlite+aiosqlite:///$PWD/.localdata/what_to_eat.db" \
EVIDENCE_DIR="$PWD/.localdata/evidence" \
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Frontend (in another terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
npm run dev -- --host  # also reachable from a phone on the same Wi-Fi
```

In development Vite proxies `/api` to `VITE_DEV_BACKEND_URL`
(default `http://127.0.0.1:8000`), so no CORS setup is needed.
For a production build served from another origin set `VITE_API_BASE_URL`
and add that origin to the backend's `FRONTEND_ORIGINS`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and production build to `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the production build |

## Structure

```text
src/
├── App.tsx                 routes
├── index.css               design system (palette, components, layout)
├── lib/                    api client, auth/toast contexts, helpers
├── hooks/useAsync.ts       data loading, countdown clock, page title, keyboard
├── types/api.ts            types mirroring app/schemas
├── components/
│   ├── layout/             AppLayout (header + bottom nav), guards, auth layout
│   ├── groups/             list, type picker, members, edit dialog
│   ├── invitations/        invite-code panel
│   └── ui/                 icon, field, dialog, loading/empty/error states
└── pages/                  Login, Register, Home, Groups, CreateGroup,
                            GroupDetail, JoinGroup, Profile, NotFound
```

## Backend endpoints used

`POST /api/v1/auth/login` · `POST /api/v1/auth/register` · `POST /api/v1/auth/refresh` ·
`GET /api/v1/auth/me` · `GET|POST /api/v1/groups/` · `GET|PATCH /api/v1/groups/{id}` ·
`GET /api/v1/groups/{id}/members` · `PATCH /api/v1/groups/{id}/membership/{user_id}/role` ·
`POST /api/v1/groups/{id}/invitations` · `POST /api/v1/groups/{id}/join` ·
`DELETE /api/v1/groups/{id}/unsubscribe`
