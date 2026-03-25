# GitHub Pages Deploy Note

This repo can use GitHub Pages for the **frontend only**.

## What GitHub Pages does

- Serves the built Vite app from `frontend/dist`
- Uses the repo subpath automatically
- Provides SPA fallback through `404.html`

## What it does not do

- It does not run the Express backend
- It does not host `/api` routes
- It does not replace Railway or your backend host

## Required GitHub secrets

Set these in the repository settings before enabling the workflow:

```env
VITE_API_BASE_URL=https://your-backend-domain.up.railway.app
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Deploy flow

1. Push to `main`
2. GitHub Actions builds the frontend with the repo base path
3. GitHub Pages publishes `frontend/dist`
4. The workflow copies `index.html` to `404.html` for client-side routing

## Notes

- The backend should stay deployed on Railway or another server
- If you change the repo name, the Pages base path updates automatically in the workflow
- The frontend build is already configured to handle Pages-safe asset URLs and login redirects

