# MediSathi — VS Code setup & end-to-end test

Follow these steps in order. **Part A** runs fully on your PC without Exotel or Sarvam keys. **Part B** connects real WhatsApp via Exotel.

---

## Part A: Local mock test (5 minutes)

### 1. Open project in VS Code

```
File → Open Folder → MediSathi1
```

### 2. One-time setup (Terminal in VS Code: `` Ctrl+` ``)

```powershell
cd c:\Users\naina\OneDrive\Desktop\MediSathi1
npm install
npx prisma db push
```

A `.env` file is already created with `DEV_MOCK_EXOTEL=true` and SQLite — no PostgreSQL or Docker needed.

### 3. Start the server

**Option A — Terminal**

```powershell
npm run dev
```

Wait until you see:

```
MediSathi running on http://localhost:3000
DEV MOCK mode — WhatsApp messages print to console
```

**Option B — VS Code debugger**

1. Run task: `Terminal → Run Task → medisathi: setup-all` (first time only)
2. Press `F5` → choose **MediSathi: Dev server**

### 4. Run end-to-end test (second terminal)

```powershell
npm run e2e
```

You should see:

- Schedule seeded with a time window = **right now**
- Mock reminder sent to patient `919876543211` with Taken / Will take / Skipped
- Patient taps **Taken** → status `taken`
- Caregiver **STATUS** summary

Mock messages also appear in the **first terminal** (dev server console).

### 5. Manual API playground

With server running, open in browser or use REST Client:

| Action | URL |
|--------|-----|
| Dev home | http://localhost:3000/dev |
| Health | http://localhost:3000/health |
| All mock messages | http://localhost:3000/dev/messages |

**Simulate caregiver SETUP (PowerShell):**

```powershell
Invoke-RestMethod -Uri http://localhost:3000/dev/simulate-incoming -Method POST -ContentType "application/json" -Body '{"from":"919876543210","text":"SETUP"}'
```

---

## Part B: Real WhatsApp with Exotel

### 1. Get credentials

1. **Exotel** — [developer.exotel.com](https://developer.exotel.com)  
   - API Key, API Token, Account SID  
   - WhatsApp-enabled number (`EXOTEL_WHATSAPP_FROM`)

2. **Sarvam** (optional, for voice) — [sarvam.ai](https://www.sarvam.ai/) → API key

3. **Meta templates** — see [docs/TEMPLATES.md](docs/TEMPLATES.md)

### 2. Expose localhost to internet (webhooks)

Install ngrok: https://ngrok.com/download

```powershell
ngrok http 3000
```

Copy the HTTPS URL (e.g. `https://abc123.ngrok-free.app`).

### 3. Update `.env`

```env
DEV_MOCK_EXOTEL=false

EXOTEL_API_KEY=your_real_key
EXOTEL_API_TOKEN=your_real_token
EXOTEL_ACCOUNT_SID=your_sid
EXOTEL_WHATSAPP_FROM=91XXXXXXXXXX

WEBHOOK_BASE_URL=https://abc123.ngrok-free.app
MEDIA_PUBLIC_BASE_URL=https://abc123.ngrok-free.app/media

SARVAM_API_KEY=your_sarvam_key
```

Restart `npm run dev`.

### 4. Configure Exotel webhooks

Exotel Console → **Messaging → Webhooks → Phone Number**:

| Field | Value |
|-------|-------|
| Incoming | `https://YOUR-NGROK-URL/webhooks/exotel/incoming` |
| Status (optional) | `https://YOUR-NGROK-URL/webhooks/exotel/status` |

Wait 10–15 minutes for activation.

### 5. Live WhatsApp test

1. From your phone, message the Exotel WhatsApp business number: `SETUP`
2. Complete the 7-step guided setup
3. Set the reminder window to the **current time** (e.g. if it's 10:15, use `10:15` to `10:35`)
4. Patient phone will receive the reminder with buttons during that window

**Caregiver commands:** `STATUS`, `PAUSE`, `RESUME`, `SETUP`, `FLOW` (if Flow ID set)

---

## VS Code quick reference

| Task | Command |
|------|---------|
| Install + DB | `Run Task → medisathi: setup-all` |
| Dev server | `F5` → MediSathi: Dev server |
| E2E test | `npm run e2e` (server must be running) |
| DB browser | `npm run db:studio` |

---

## Switching to PostgreSQL (production)

1. Change `prisma/schema.prisma` provider to `postgresql`
2. Set `DATABASE_URL=postgresql://...` in `.env`
3. Run `npx prisma db push`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `E2E: Server not running` | Start `npm run dev` first |
| Prisma error | Run `npx prisma generate` then `npx prisma db push` |
| Exotel 401 | Check API key/token/SID in `.env` |
| No WhatsApp inbound | Verify ngrok URL in Exotel webhook; use HTTPS |
| Voice not working | Set `SARVAM_API_KEY` and public `MEDIA_PUBLIC_BASE_URL` (ngrok) |
