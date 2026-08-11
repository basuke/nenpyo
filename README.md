# nenpyo-net

Cloudflare Workers project built with [Hono](https://hono.dev/), [Vite](https://vite.dev/)
(via `@cloudflare/vite-plugin`), and [Vitest](https://vitest.dev/).

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

Vite dev server runs at `http://localhost:5173` with the Workers runtime.

## Test

```bash
pnpm test        # run once
pnpm test:watch  # watch mode
```

Tests run inside the real Workers runtime via `@cloudflare/vitest-pool-workers`.

## Deploy

```bash
pnpm deploy      # vite build && wrangler deploy
```

Deployed at custom domain: https://nenpyo.net/

### Custom domain

The `nenpyo.net` custom domain is configured via `routes` in `wrangler.jsonc`.
On the first deploy, Wrangler creates the DNS record and provisions the TLS
certificate automatically.

Prerequisite: the `nenpyo.net` zone must be added to your Cloudflare account
(active nameservers). Verify with `pnpm exec wrangler whoami`.

## CI/CD

`.github/workflows/deploy.yml` runs on every push and pull request:

1. **Test** — install, typecheck, and run Vitest.
2. **Deploy** — on push to `main` only, after tests pass, build and deploy to
   Cloudflare Workers.

Required GitHub repository secrets:

| Secret                 | Description                                                        |
| ---------------------- | ----------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | API token (SiestaWare account) with **Edit Workers** permission   |
| `CLOUDFLARE_ACCOUNT_ID`| SiestaWare account ID (also pinned in `wrangler.jsonc`)            |

## Current status

The Worker is in **maintenance / coming-soon** mode: every request returns
HTTP `503` with a styled "近日公開" page. Swap `src/index.ts` to real routes
when ready to launch.

## Scripts

- `pnpm dev` — start Vite dev server (Workers runtime)
- `pnpm build` — build with Vite
- `pnpm preview` — build then preview locally
- `pnpm deploy` — build and deploy to Cloudflare
- `pnpm test` / `pnpm test:watch` — run Vitest
- `pnpm cf-typegen` — regenerate `worker-configuration.d.ts` from bindings
- `pnpm typecheck` — run TypeScript type checking

## License

[MIT](./LICENSE.md) © 2026 basuke
