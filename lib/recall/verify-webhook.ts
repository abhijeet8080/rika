import { createHmac, timingSafeEqual } from "node:crypto";
import { getRecallAccount, getRecallAccountChoices, type RecallAccountId } from "./accounts";

// Svix-compatible scheme: https://docs.recall.ai/docs/authenticating-requests-from-recallai
export function verifyRecallWebhookSignature(
  headers: Headers,
  rawBody: string,
): boolean {
  return getRecallWebhookAccount(headers, rawBody) !== null;
}

export function getRecallWebhookAccount(
  headers: Headers,
  rawBody: string,
): RecallAccountId | null {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return null;

  for (const accountId of getRecallAccountChoices()) {
    const secretBytes = Buffer.from(
      getRecallAccount(accountId).webhookSecret.replace(/^whsec_/, ""),
      "base64",
    );
    const signedContent = `${id}.${timestamp}.${rawBody}`;
    const expected = createHmac("sha256", secretBytes)
      .update(signedContent)
      .digest("base64");
    const expectedBuf = Buffer.from(expected);

    const valid = signatureHeader.split(" ").some((candidate) => {
      const [version, sig] = candidate.split(",");
      if (version !== "v1" || !sig) return false;
      const sigBuf = Buffer.from(sig);
      return (
        sigBuf.length === expectedBuf.length &&
        timingSafeEqual(sigBuf, expectedBuf)
      );
    });
    if (valid) return accountId;
  }
  return null;
}
