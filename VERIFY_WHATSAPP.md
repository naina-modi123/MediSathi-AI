# Verify MediSathi on WhatsApp (Twilio + Sarvam)

## Architecture

| Layer | Service |
|-------|---------|
| WhatsApp messages | **Twilio** Messaging API |
| Reminder phone calls | **Twilio** Voice API + Sarvam TTS audio |
| Voice notes (patient reply) | **Sarvam** STT |
| Spoken reminders | **Sarvam** TTS (Hindi, Tamil, etc.) |

## 1. Twilio Console setup

1. [console.twilio.com](https://console.twilio.com) → copy **Account SID** (`AC...`) into `.env` → `TWILIO_ACCOUNT_SID`
2. API Key SID (`SK...`) and Secret are already in `.env`
3. **Messaging → Try WhatsApp → Sandbox**  
   - Join: send `join <your-code>` from your phone to the sandbox number  
   - Set `TWILIO_WHATSAPP_FROM` to that sandbox number (e.g. `14155238886`)

## 2. Webhooks (ngrok)

```powershell
ngrok http 3000
```

`.env`:

```env
DEV_MOCK_MESSAGING=false
WEBHOOK_BASE_URL=https://YOUR-NGROK.ngrok-free.app
MEDIA_PUBLIC_BASE_URL=https://YOUR-NGROK.ngrok-free.app/media
```

Twilio Console → Phone Numbers → your WhatsApp sender → **Messaging webhook**:

```
https://YOUR-NGROK.ngrok-free.app/webhooks/twilio/whatsapp
```

Voice number → **Voice webhook** (if using calls):

```
https://YOUR-NGROK.ngrok-free.app/webhooks/twilio/voice/reminder
```

## 3. Run

```powershell
npm install
npx prisma db push --accept-data-loss
npm run test:twilio
npm run dev
```

## 4. Test on your phone

| Step | Action |
|------|--------|
| 1 | Join Twilio WhatsApp sandbox |
| 2 | Message sandbox number: `SETUP` |
| 3 | Complete 7-step setup |
| 4 | Set reminder window to **current time** |
| 5 | Patient gets reminder — reply **1** Taken, **2** Later, **3** Skip |
| 6 | Optional: voice call + Sarvam audio if `SARVAM_API_KEY` set |

## Local mock (no Twilio)

```powershell
# .env: DEV_MOCK_MESSAGING=true
npm run dev
npm run e2e
```

## Commands

`SETUP` · `STATUS` · `PAUSE` · `RESUME` · `मदद`
