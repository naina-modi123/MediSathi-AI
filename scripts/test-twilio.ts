import "dotenv/config";
import twilio from "twilio";

async function main() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY_SID;
  const apiSecret = process.env.TWILIO_API_KEY_SECRET;

  if (!accountSid?.startsWith("AC")) {
    console.error(
      "❌ Set TWILIO_ACCOUNT_SID in .env (starts with AC — find it at https://console.twilio.com)"
    );
    console.error("   Your API Key SID (SK...) is NOT the Account SID.");
    process.exit(1);
  }

  const client = twilio(apiKey!, apiSecret!, { accountSid });

  const account = await client.api.accounts(accountSid).fetch();
  console.log("✅ Account:", account.friendlyName, accountSid);

  const from = process.env.TWILIO_WHATSAPP_FROM;
  console.log("WhatsApp from:", from);

  console.log("\nTo test WhatsApp sandbox, join: send 'join <sandbox-code>' to your Twilio sandbox number.");
  console.log("Then set TWILIO_WHATSAPP_FROM to that sandbox number in .env");
}

main().catch((e) => {
  console.error("❌", (e as Error).message);
  process.exit(1);
});
