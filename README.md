# nenpyo-net

Cloudflare Workers project using [Hono](https://hono.dev/).

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Local server runs at `http://localhost:8787`.

## Deploy

```bash
npm run deploy
```

Deployed at custom domain: https://nenpyo.net/

### Custom domain

The `nenpyo.net` custom domain is configured via `routes` in `wrangler.jsonc`.
On the first `npm run deploy`, Wrangler creates the DNS record and provisions the
TLS certificate automatically.

Prerequisite: the `nenpyo.net` zone must be added to your Cloudflare account
(active nameservers). Verify with:

```bash
npx wrangler login          # authenticate
npx wrangler whoami         # check account
```

## Current status

The Worker is in **maintenance / coming-soon** mode: every request returns
HTTP `503` with a styled "近日公開" page. Swap `src/index.ts` back to real
routes when ready to launch.

## Scripts

- `npm run dev` — start local dev server
- `npm run deploy` — deploy to Cloudflare
- `npm run cf-typegen` — regenerate `worker-configuration.d.ts` from bindings
- `npm run typecheck` — run TypeScript type checking

## License

[MIT](./LICENSE.md) © 2026 basuke
