import { WebClient } from "@slack/web-api";
import { createHmac, timingSafeEqual } from "crypto";

let _client: WebClient | null = null;

export function getSlackClient() {
  if (!_client) _client = new WebClient(process.env.SLACK_BOT_TOKEN);
  return _client;
}

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const computedSig = `v0=${hmac}`;

  try {
    return timingSafeEqual(Buffer.from(computedSig), Buffer.from(signature));
  } catch {
    return false;
  }
}
