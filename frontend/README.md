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
├── lib/                    api client, auth/toast contexts, format & clipboard helpers
├── hooks/useAsync.ts       data loading, countdown clock, page title, keyboard
├── types/api.ts            types mirroring app/schemas
├── components/
│   ├── layout/             AppLayout (header + notifications + bottom nav), guards, auth layout
│   ├── groups/             list, type picker, members, edit dialog
│   ├── meals/              FamilyMealsPanel (recipe catalog + shopping responsibilities)
│   ├── decisions/          DecisionRoundsPanel (pitch & spin + turn-based meal picks)
│   ├── gatherings/         GatheringsPanel (schedule & list group events)
│   ├── invitations/        invite-code panel
│   └── ui/                 icon, field, dialog, loading/empty/error states
└── pages/                  Login, Register, Home, Groups, CreateGroup,
                            GroupDetail, GatheringDetail, JoinGroup,
                            Notifications, Profile, NotFound
```

## Backend endpoints used

- **Auth**: `POST /api/v1/auth/login` · `POST /api/v1/auth/register` · `POST /api/v1/auth/refresh` · `GET /api/v1/auth/me`
- **Groups & Invitations**: `GET|POST /api/v1/groups/` · `GET|PATCH /api/v1/groups/{id}` · `GET /api/v1/groups/{id}/members` · `PATCH /api/v1/groups/{id}/membership/{user_id}/role` · `POST /api/v1/groups/{id}/invitations` · `POST /api/v1/groups/{id}/join` · `DELETE /api/v1/groups/{id}/unsubscribe`
- **Family Meals & Shopping**: `GET|POST /api/v1/family-meals/{group_id}/meals` · `GET|PATCH|DELETE /api/v1/family-meals/meals/{meal_id}` · `GET|POST /api/v1/family-meals/{group_id}/responsibilities` · `PATCH /api/v1/family-meals/responsibilities/{id}/status` · `POST /api/v1/family-meals/responsibilities/{id}/report`
- **Food Decisions**: `GET|POST /api/v1/food-decisions/groups/{group_id}/rounds` · `POST /api/v1/food-decisions/rounds/{round_id}/submissions` · `POST /api/v1/food-decisions/rounds/{round_id}/resolve` · `POST /api/v1/food-decisions/rounds/{round_id}/cancel` · `POST /api/v1/food-decisions/decisions`
- **Gatherings, RSVPs & Menu**: `POST /api/v1/gatherings/create-gathering` · `GET /api/v1/gatherings/group/{group_id}` · `GET /api/v1/gatherings/event/{event_id}` · `PATCH /api/v1/gatherings/event/update/{event_id}` · `DELETE /api/v1/gatherings/event/delete/{event_id}` · `GET /api/v1/gatherings/event/{event_id}/rsvps` · `POST /api/v1/gatherings/event/{event_id}/rsvp` · `GET|POST /api/v1/gatherings/event/{event_id}/menu` · `DELETE /api/v1/gatherings/menu/{item_id}`
- **Notifications**: `GET /api/v1/notifications/` · `PATCH /api/v1/notifications/{id}/read` · `POST /api/v1/notifications/read-all`
