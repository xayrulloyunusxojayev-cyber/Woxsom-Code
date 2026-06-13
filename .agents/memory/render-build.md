---
name: Render build command
description: Exact Render dashboard settings for deploying this monorepo.
---

## Render Dashboard Settings

**Build Command:**
```
pnpm install && pnpm run build
```

**Start Command:**
```
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

**Environment Variable required at runtime:**
```
PORT=8080
```

**Optional (improves key encryption security):**
```
SESSION_SECRET=<any long random string>
```

## Why the root build script is structured this way

`package.json` build script:
```json
"build": "pnpm run typecheck:libs && pnpm --filter \"@workspace/api-server\" --filter \"@workspace/woxsom-code\" run build"
```

1. `typecheck:libs` runs `tsc --build` which compiles `lib/api-zod` and `lib/api-client-react` declarations via TypeScript project references. This MUST run first so the api-server typecheck can resolve `@workspace/api-zod`.
2. Then only `api-server` and `woxsom-code` are built — `mockup-sandbox` is explicitly excluded because it is a dev-only canvas tool and its PORT requirement causes build failures in CI.
3. `api-server` build uses esbuild (not tsc) so it is fast and never fails on type errors.
4. `woxsom-code` build uses Vite and outputs to `artifacts/woxsom-code/dist/public/` which the api-server serves as static files at runtime.

## PORT handling
All Vite configs (`woxsom-code`, `mockup-sandbox`) use `process.env.PORT ?? "<fallback>"` — no more hard throw if PORT is missing.
