/**
 * End-to-end local test (mock WhatsApp).
 * Start the dev server first: npm run dev
 * Then run: npm run e2e
 */

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

async function waitForServer(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* server not up */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Server not running at ${BASE}. Start it with: npm run dev`
  );
}

async function main() {
  console.log("Waiting for MediSathi server...");
  await waitForServer();

  console.log("\n--- Running E2E flow ---\n");
  const res = await fetch(`${BASE}/dev/e2e`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caregiverPhone: "919876543210",
      patientPhone: "919876543211",
    }),
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (!res.ok || !data.ok) {
    process.exit(1);
  }

  console.log("\n✅ E2E passed!");
  console.log(`   Dose status: ${data.latestDoseStatus}`);
  console.log(`   Mock messages sent: ${data.mockMessages?.length ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
