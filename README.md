# MediSathi

AI-powered medicine reminder assistant for elderly people in India.

**Twilio** — WhatsApp messages + voice reminder calls  
**Sarvam AI** — Hindi/multilingual text-to-speech and speech-to-text for voice replies

## Features

- Family sets schedule via WhatsApp (`SETUP`)
- Reminders only inside configured time windows
- Reply **1** Taken · **2** Will take · **3** Skipped (or voice note via Sarvam STT)
- Voice reminder calls (Twilio Voice + Sarvam TTS)
- Family alerts on missed doses · daily digest at 9 PM

## Quick start

```powershell
cp .env.example .env
# Add TWILIO_ACCOUNT_SID (AC...) from console.twilio.com
npm install
npx prisma db push --accept-data-loss
npm run dev
npm run e2e
```

See [VERIFY_WHATSAPP.md](VERIFY_WHATSAPP.md) for live WhatsApp on your phone.

## Environment

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Account SID (`AC...`) from Twilio Console |
| `TWILIO_API_KEY_SID` | API Key (`SK...`) |
| `TWILIO_API_KEY_SECRET` | API Key secret |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender number |
| `SARVAM_API_KEY` | Sarvam TTS/STT |
| `DEV_MOCK_MESSAGING` | `true` = local test without Twilio |
| `WEBHOOK_BASE_URL` | Public URL (ngrok) for webhooks |

## Webhooks

| Path | Purpose |
|------|---------|
| `POST /webhooks/twilio/whatsapp` | Incoming WhatsApp |
| `POST /webhooks/twilio/voice/gather` | Phone keypad 1/2/3 |
| `POST /webhooks/twilio/status` | Message delivery |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server |
| `npm run e2e` | Full mock flow test |
| `npm run test:twilio` | Validate Twilio credentials |
