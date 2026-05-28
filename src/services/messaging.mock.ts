export interface MockMessage {
  id: string;
  to: string;
  type: string;
  body: string;
  sentAt: Date;
}

const mockOutbox: MockMessage[] = [];
const mockCalls: Array<{ to: string; twiml: string; at: Date }> = [];

export interface SendResult {
  requestId?: string;
  raw: unknown;
}

export function pushMockMessage(to: string, type: string, body: string): SendResult {
  const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mockOutbox.push({ id, to, type, body, sentAt: new Date() });
  console.log(`\n📱 [MOCK WhatsApp → ${to}] (${type})\n${body}\n`);
  return { requestId: id, raw: { mock: true } };
}

export function pushMockCall(to: string, twiml: string): SendResult {
  const id = `call_${Date.now()}`;
  mockCalls.push({ to, twiml, at: new Date() });
  console.log(`\n📞 [MOCK Voice call → ${to}]\n${twiml.slice(0, 200)}...\n`);
  return { requestId: id, raw: { mock: true } };
}

export function getMockOutbox(): MockMessage[] {
  return [...mockOutbox];
}

export function getMockCalls() {
  return [...mockCalls];
}

export function clearMockOutbox(): void {
  mockOutbox.length = 0;
  mockCalls.length = 0;
}
