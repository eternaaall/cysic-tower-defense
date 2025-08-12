# Cysic Tower Defense — Starter

Front: React + Vite + Phaser
API: Fastify + Postgres
Infra: Docker Compose (API, DB, cloudflared Quick Tunnel)
EN-only UI, with Cysic logo and footer "Made with love for Cysic and the ZK family."

VPS quick start: install Docker, clone your repo, cd infra, cp .env.example .env, docker compose up -d, then docker compose logs -f cloudflared to get https://*.trycloudflare.com

Netlify: Base dir apps/web, Build npm run build, Publish apps/web/dist, Env VITE_API_BASE=https://<your_trycloudflare_api_url>

Admin reserve:
curl -X POST <API>/api/admin/reserve-nick -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" -d '{"nickname":"eternaaall","device_id":"<DEVICE_ID>"}'
