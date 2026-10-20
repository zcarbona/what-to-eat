# What to Eat

Collaborative meal planning for families, friend groups, and gatherings.

## Run with Docker Compose

Both `app` (FastAPI backend) and `frontend` (React 19 + Vite SPA) have their own `Dockerfile` and are combined in `docker-compose.yml` on a shared bridge network (`what-to-eat-net`), with a persistent Docker volume (`backend_data`) mounted at `/data` in the backend container.

```bash
# Build and start both containers
docker compose up --build

# Or run in detached mode
docker compose up --build -d
```

- **Frontend**: http://localhost:5173 (proxies `/api` and `/health` to `http://backend:8000` over `what-to-eat-net`)
- **Backend API & Docs**: http://localhost:8000/docs
- **Stop containers**: `docker compose down` (add `-v` only if you want to wipe the `backend_data` volume)
