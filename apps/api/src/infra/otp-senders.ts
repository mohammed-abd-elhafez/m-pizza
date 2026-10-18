import type { OtpSender } from "../application/auth-ports";

/**
 * Development only: prints the code to the server console instead of sending an SMS.
 * `server.ts` refuses to use it when NODE_ENV=production.
 */
export class ConsoleOtpSender implements OtpSender {
  async send(phone: string, code: string): Promise<void> {
    console.warn(`[dev-otp] code for ${phone}: ${code}`);
  }
}

/** Collects sent codes in memory so tests can read them back. */
export class CapturingOtpSender implements OtpSender {
  readonly sent: { phone: string; code: string }[] = [];

  async send(phone: string, code: string): Promise<void> {
    this.sent.push({ phone, code });
  }

  last(phone: string): string {
    const entry = [...this.sent].reverse().find((s) => s.phone === phone);
    if (!entry) throw new Error(`No code was sent to ${phone}`);
    return entry.code;
  }
}
