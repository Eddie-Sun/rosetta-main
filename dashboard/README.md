This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prereqs (Auth)

This dashboard uses Clerk.

- **Fastest (zero config)**: run `pnpm dev` and Clerk will start in **keyless mode** locally. Your terminal will print a “claim” link if you want to attach the dev instance to your Clerk account.
- **Recommended (stable dev)**: create a Clerk app and add keys to `dashboard/.env.local`.

Template (copy to `dashboard/.env.local`):

```bash
cp clerk.env.example .env.local
```

Then edit `.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
CLERK_SECRET_KEY=YOUR_SECRET_KEY
```

Restart `pnpm dev` after changing env vars.

### Prereqs (Database)

This dashboard uses Prisma + Postgres (Neon recommended).

1. Create a Neon database and copy the pooled + direct connection strings.
2. Add `DATABASE_URL` to `dashboard/.env.local`.

Template:

```bash
cat neon.prisma.env.example
```

Then run migrations (requires env vars set):

```bash
pnpm prisma:migrate
```

### Prereqs (Firecrawl)

Overview can generate a starter list of URLs using Firecrawl `/v2/map`.

Add this to `dashboard/.env.local`:

```bash
FIRECRAWL_API_KEY=YOUR_FIRECRAWL_KEY
```

### Prereqs (Worker + KV)

For production-style “Check” (dashboard triggers the worker to render/scrape a single page) the dashboard uses a **service-auth internal worker endpoint** and the worker uses **Cloudflare KV** as its auth/config source of truth.

Add these to `dashboard/.env.local`:

```bash
# Dashboard -> Worker
WORKER_API_URL=https://rosetta-worker.YOUR_ACCOUNT.workers.dev
WORKER_INTERNAL_API_KEY=YOUR_INTERNAL_KEY

# Worker -> Dashboard (metrics callback)
DASHBOARD_API_KEY=YOUR_DASHBOARD_API_KEY

# Dashboard -> Cloudflare KV (to sync domains/tokens)
CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID
CLOUDFLARE_API_TOKEN=YOUR_API_TOKEN
# Optional (defaults to bound namespace id):
# CLOUDFLARE_KV_NAMESPACE_ID=...
```

### Run

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
