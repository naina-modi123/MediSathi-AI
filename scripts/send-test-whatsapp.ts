import "dotenv/config";
import { sendText } from "../src/services/twilio.client.js";

const to = process.argv[2] ?? process.env.TEST_TO_PHONE;
if (!to) {
  console.error("Usage: npx tsx scripts/send-test-whatsapp.ts 91XXXXXXXXXX");
  process.exit(1);
}

sendText(
  to,
  "🙏 MediSathi is connected (Twilio)!\n\nSend SETUP to add medicine reminders.\nReply 1=Taken, 2=Later, 3=Skip when reminded."
)
  .then((r) => console.log("Sent:", r))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
