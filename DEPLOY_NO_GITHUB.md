# No-GitHub Deployment

This project is safest to deploy as:

- Frontend: Vercel CLI
- Backend: Railway CLI

The current backend writes profile images to the local filesystem in `dessert-ai-system/server/uploads`, so it is not a good fit for Vercel serverless as-is.
It will run on Railway, but those uploaded files are still not durable across redeploys because they are stored on the service filesystem.

## 1. Deploy the backend with Railway CLI

From the project root:

```bash
cd dessert-ai-system
npm install
npm install -g @railway/cli
railway login
railway init
railway up
```

After Railway creates the service, add these environment variables in Railway:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=
FRONTEND_APP_URL=
PAYMONGO_PAYMENT_METHOD_TYPES=gcash,card,grab_pay
PAYMONGO_STATEMENT_DESCRIPTOR=VNG DESSERT
NODE_ENV=production
```

Notes:

- Do not set `PORT` manually unless you specifically need to. Railway provides it.
- Generate a public Railway domain for the backend after the first deploy.

## 2. Deploy the frontend with Vercel CLI

From the project root:

```bash
npm install -g vercel
vercel
vercel --prod
```

Vercel will use the root `vercel.json` when you deploy from the repo root.

- Repo root: uses the root `vercel.json` and builds `frontend/dist`
- `frontend` directory: still works if you want the older frontend-only setup

Add these environment variables in Vercel:

```env
VITE_API_BASE_URL=https://your-backend-domain.up.railway.app
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 3. Connect the two deployments

Once the frontend has a real Vercel URL, update this variable in Railway:

```env
FRONTEND_APP_URL=https://your-frontend-domain.vercel.app
```

Redeploy the Railway service after changing it.

This value is used by the PayMongo checkout flow to build:

- success return URLs
- cancel return URLs

## 4. Set the PayMongo webhook

In PayMongo, create a webhook that points to:

```text
https://your-backend-domain.up.railway.app/api/payments/webhooks/paymongo
```

Then copy the webhook secret into:

```env
PAYMONGO_WEBHOOK_SECRET=whsec_xxx
```

Redeploy the backend after updating it.

## 5. Verify after deployment

Check these URLs:

- Frontend loads on Vercel
- Backend health: `https://your-backend-domain.up.railway.app/api/health`
- Backend DB health: `https://your-backend-domain.up.railway.app/api/health/database`

Then test:

- login
- products page
- cart
- checkout
- PayMongo success return
- PayMongo cancel return

## Why this setup

- Vercel is a strong fit for the Vite frontend.
- Railway can deploy the existing Express backend from local CLI without GitHub.
- This avoids the current Vercel backend problems around long-lived Express behavior and local file uploads.
- Profile image uploads should eventually move to Supabase Storage or another object store for durable production storage.
