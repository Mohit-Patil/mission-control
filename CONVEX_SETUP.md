# Convex setup (Mission Control)

Convex requires an interactive login/config step once.

## 1) One-time setup

From this folder:

```bash
cd /home/ubuntu/.openclaw/workspace/mission-control
npx convex dev --configure=new
```

It will prompt you to login and create/select a deployment.

This creates:
- `.convex/` metadata
- `convex.json`
- `.env.local` entries like `NEXT_PUBLIC_CONVEX_URL=...`

## 2) Run locally

```bash
npm run dev -- --hostname 0.0.0.0 --port 3004
```

## 3) Notes

- Don’t commit `.env.local` if it contains secrets.
- `NEXT_PUBLIC_CONVEX_URL` is safe to be public.

