# nenpyo-net

Cloudflare Workers project using [Hono](https://hono.dev/).

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

Local server runs at `http://localhost:8787`.

## Deploy

```bash
pnpm deploy
```

Deployed at custom domain: https://nenpyo.net/

### Custom domain

The `nenpyo.net` custom domain is configured via `routes` in `wrangler.jsonc`.
On the first `pnpm deploy`, Wrangler creates the DNS record and provisions the
TLS certificate automatically.

Prerequisite: the `nenpyo.net` zone must be added to your Cloudflare account
(active nameservers). Verify with:

```bash
pnpm exec wrangler login          # authenticate
pnpm exec wrangler whoami         # check account
```

## Current status

The Worker is in **maintenance / coming-soon** mode: every request returns
HTTP `503` with a styled "近日公開" page. Swap `src/index.ts` back to real
routes when ready to launch.

## Scripts

- `pnpm dev` — start local dev server
- `pnpm deploy` — deploy to Cloudflare
- `pnpm cf-typegen` — regenerate `worker-configuration.d.ts` from bindings
- `pnpm typecheck` — run TypeScript type checking

## License

[MIT](./LICENSE.md) © 2026 basuke
