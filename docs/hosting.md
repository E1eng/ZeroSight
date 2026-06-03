# Hosting — Frontend (Netlify) + Keeper (VPS)

The app splits cleanly into two deployables:

| Piece | Where | Why |
|-------|-------|-----|
| **Next.js app** (UI + API routes) | **Netlify** | SSR + API routes via the official Next runtime; global CDN |
| **Keeper bot** | **your VPS** | long-running process that must stay up between Netlify cold starts |

The keeper is **not** deployed to Netlify — it's a persistent daemon, not a request handler.

---

## 1. Frontend → Netlify

### What's configured

- `netlify.toml` — build command `npm run build`, Node 22, `@netlify/plugin-nextjs` (handles SSR + API routes + image optimization automatically).
- App Router SSR means **no static `publish` dir** — the plugin wires functions for you.

### Environment variables (set in Netlify, never in git)

Set these in **Site config → Environment variables** (or `netlify env:set`):

| Var | Scope | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS` | public | proxy address |
| `NEXT_PUBLIC_OWNER_ADDRESS` | public | owner addr (CDR read condition) |
| `NEXT_PUBLIC_STORY_RPC` | public | `https://aeneid.storyrpc.io` |
| `NEXT_PUBLIC_STORY_API` | public | CDR API URL |
| `NEXT_PUBLIC_STORY_CHAIN_ID` | public | `1315` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | public | Privy app id — **required**, or wallet login fails (the build no longer crashes without it, but auth won't work) |
| `DEPLOYER_PRIVATE_KEY` | **secret** | used by `/api/cdr/*` server routes to allocate/write vaults gaslessly |

> ⚠️ **Mixed-content blocker (fix before custom domain).** The CDR API is currently `http://172.192.41.96:1317` (plain HTTP IP). A browser on `https://zerosight.xyz` will **block** that insecure request — client-side CDR encrypt/allocate breaks on the live HTTPS domain even though it works on `localhost`. Options:
> - Put the CDR API behind **HTTPS** (a reverse proxy / Cloudflare-proxied subdomain like `https://cdr.zerosight.xyz` → the IP) and set `NEXT_PUBLIC_STORY_API` to that.
> - Or route CDR reads/writes only through the server-side `/api/cdr/*` routes (which can call HTTP since they run on the server), and stop calling the CDR API from the browser.
> Until then, the app may work on the Netlify `*.netlify.app` preview (also HTTPS, same issue) — so plan to terminate the CDR API over TLS for any public use.

> ⚠️ **Security note.** `/api/cdr/allocate` and `/api/cdr/write` sign with `DEPLOYER_PRIVATE_KEY` server-side and are called directly from the browser, so they are effectively **open endpoints that spend gas from that wallet**. For a testnet demo this is acceptable. Before any real traffic:
> - Fund that wallet with a **small, capped** amount of testnet IP only.
> - Treat it as a hot key — never the cold owner key in production. (Today it doubles as deployer; for mainnet, split it.)
> - Add rate-limiting / a server-verified auth (e.g. verify a Privy session token in the route) so the endpoints can't be drained. A `NEXT_PUBLIC_*` shared secret does **not** help — it ships in the browser bundle.

### Deploy via the Netlify web UI

1. **Add new site → Import an existing project → GitHub**, pick `E1eng/ZeroSight`.
2. Build settings are read from `netlify.toml` automatically — leave them as detected:
   - Build command: `npm run build`
   - Node version: 22 (from `netlify.toml`)
   - The `@netlify/plugin-nextjs` plugin is picked up automatically for SSR + API routes.
3. Before the first deploy, add the env vars under **Site configuration → Environment variables** (table above). At minimum the `NEXT_PUBLIC_*` set + `DEPLOYER_PRIVATE_KEY` (mark it as a secret).
4. **Deploy site.** Netlify builds and gives you a `*.netlify.app` URL.
5. After it's linked, every push to the default branch auto-builds and deploys. Use **Deploys → Trigger deploy** for a manual rebuild (e.g. after changing env vars — env changes need a fresh build to take effect).

> No CLI needed. `netlify.toml` is the single source of truth for build config, so the dashboard and any future CLI use stay in sync.

### Custom domain: `zerosight.xyz` (DNS on Cloudflare)

Netlify hosts the site; Cloudflare just points DNS at it. Two ways — **A) Netlify DNS records on Cloudflare** (recommended, simplest TLS) or **B) Netlify as the apex via their load balancer**.

**Steps (Cloudflare-managed DNS → Netlify):**

1. **Netlify → Site config → Domain management → Add a custom domain** → enter `zerosight.xyz`. Add `www.zerosight.xyz` too; pick one as primary (apex `zerosight.xyz` is fine) and let the other redirect.
2. Netlify shows the target host. In **Cloudflare → DNS**, add:

   | Type | Name | Value | Proxy |
   |------|------|-------|-------|
   | `CNAME` | `www` | `<your-site>.netlify.app` | **DNS only (grey cloud)** |
   | `A` | `@` (apex) | `75.2.60.5` (Netlify's load balancer) | **DNS only (grey cloud)** |

   Or, if you prefer CNAME flattening for the apex (Cloudflare supports it):

   | Type | Name | Value | Proxy |
   |------|------|-------|-------|
   | `CNAME` | `@` | `<your-site>.netlify.app` | **DNS only (grey cloud)** |

3. **Turn the proxy OFF (grey cloud)** for these records. If the orange cloud is on, Cloudflare terminates TLS and Netlify can't provision its Let's Encrypt cert → you get redirect loops / cert errors. Leave it grey at least until Netlify shows the cert as issued.
4. Back in Netlify, wait for **HTTPS / SSL** to show "Certificate provisioned" (a few minutes after DNS propagates). Netlify auto-renews it.
5. Enable **Force HTTPS** in Netlify domain settings.

**Cloudflare SSL mode:** if you later re-enable the orange proxy, set **SSL/TLS → Full (strict)** — never "Flexible" (Flexible causes redirect loops with Netlify's own HTTPS redirect).

> The app reads its own base URL from `metadataBase` (`https://zerosight.xyz`) for social/OG previews — already set in `app/layout.tsx`. No env var needed for the domain itself.

---

## 2. Keeper → VPS

The keeper drives the market lifecycle. Pick **one** of the two supported run modes.

### Prereqs on the VPS

```bash
# Node 22 (CDR file storage needs 22+)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # v22.x

git clone https://github.com/E1eng/ZeroSight.git
cd ZeroSight
npm ci
cp .env.example .env   # then fill it in (see below)
```

Keeper `.env` needs: `MARKET_OPERATOR_PRIVATE_KEY`, `NEXT_PUBLIC_ZERO_SIGHT_MARKET_ADDRESS`,
`STORY_RPC_URL` (+ optional `STORY_RPC_FALLBACKS`), `STORY_API_URL`, and the tuning vars
(`HOURLY_OPEN_SECONDS`, `KEEPER_HEALTH_PORT`, gas/concurrency knobs — see `.env.example`).

### Option A — PM2 (simplest)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs zerosight-keeper
pm2 save && pm2 startup    # survive reboots (run the printed command)
```

Health: `curl -s localhost:8787/health` → `200` healthy / `503` stalled.

### Option B — Docker

```bash
docker build -f Dockerfile.keeper -t zerosight-keeper .
docker run -d --name zerosight-keeper \
  --restart=unless-stopped \
  --env-file .env \
  -p 8787:8787 \
  zerosight-keeper
docker logs -f zerosight-keeper
```

The image has a built-in `HEALTHCHECK` hitting `/health`, so Docker marks the
container unhealthy if the keeper hangs.

### Keep the health port private

`KEEPER_HEALTH_PORT` (8787) is for *you*, not the public. Either bind it to
localhost and reach it via SSH tunnel, or firewall it:

```bash
# SSH tunnel from your laptop:
ssh -L 8787:localhost:8787 user@your-vps
curl -s localhost:8787/status | jq

# …or restrict at the firewall (ufw example):
sudo ufw allow from <your-ip> to any port 8787
```

### Updating the keeper

```bash
cd ZeroSight && git pull && npm ci
pm2 restart zerosight-keeper          # PM2
# or: docker build -f Dockerfile.keeper -t zerosight-keeper . && docker restart zerosight-keeper
```

The keeper is **stateless across restarts** — it rebuilds each asset's phase
from on-chain state, so restarting mid-round is safe.

---

## 3. Post-deploy checklist

- [ ] Netlify build green; site loads; wallet connects on Story Aeneid.
- [ ] **Privy dashboard → allowed origins** includes `https://zerosight.xyz` (and `https://www.zerosight.xyz`) — otherwise login fails on the live domain.
- [ ] Cloudflare DNS records are **grey-cloud (DNS only)** and Netlify shows the cert as provisioned; **Force HTTPS** enabled.
- [ ] Placing a bet works end-to-end (encrypt → allocate → write → on-chain confirm).
- [ ] Open Graph preview looks right (test the URL in the Twitter/LinkedIn post composer or a card validator).
- [ ] Keeper `/health` returns 200; `/status` shows assets advancing through phases.
- [ ] A full round settles (Open → Locked → Resolved → Distributed) and shows up in `/portfolio`.
- [ ] CDR signer wallet (`DEPLOYER_PRIVATE_KEY`) funded with a **small** testnet balance only.
- [ ] Keeper health port is firewalled / tunneled, not public.
