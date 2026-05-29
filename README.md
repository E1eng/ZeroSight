# ZeroSight Protocol

Blind parimutuel markets secured by Story CDR and Privy auth.

## Getting Started

```bash
npm install
npm run dev
```

### Environment Variables
Create a `.env.local` with at least:

```
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_STORY_RPC=https://aeneid.storyrpc.io
NEXT_PUBLIC_STORY_API=http://172.192.41.96:1317
NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS=0x...
```

### Scripts
- `npm run dev` – Next.js dev server.
- `npm run lint` – ESLint (Next rules).
- `npm run format` / `npm run format:fix` – Prettier check/fix.
- `npm run test` – Vitest suite (unit tests).

### Tooling
- **Pre-commit**: Husky + lint-staged runs Prettier and targeted ESLint.
- **Testing**: Vitest with jsdom, Testing Library helpers.
- **Path aliases**: Leverage `@/` imports via `tsconfig.json` and Vitest config.

### Pending Enhancements
- Add Playwright smoke tests for UI flows.
- Integrate GitHub Actions for lint/test pipelines.
- Expand Foundry coverage and deploy scripts.
