import { env } from "@/lib/env";

export type RecallAccountId = "primary" | "secondary";

export function getRecallAccount(id: string = "primary") {
  if (id === "primary") {
    return {
      id: "primary" as const,
      apiKey: env.RECALL_API_KEY,
      region: env.RECALL_API_REGION,
      webhookSecret: env.RECALL_WEBHOOK_SECRET,
    };
  }
  if (id === "secondary") {
    const apiKey = process.env.RECALL_SECONDARY_API_KEY;
    const region = process.env.RECALL_SECONDARY_API_REGION;
    const webhookSecret = process.env.RECALL_SECONDARY_WEBHOOK_SECRET;
    if (!apiKey || !region || !webhookSecret) {
      throw new Error("Secondary Recall account requires an API key, region, and webhook secret");
    }
    return { id: "secondary" as const, apiKey, region, webhookSecret };
  }
  throw new Error("Unknown Recall account");
}

export function getDefaultRecallAccountId(): RecallAccountId {
  return getRecallAccount(process.env.RECALL_DEFAULT_ACCOUNT || "primary").id;
}

// This is the only account information that may be passed to the browser.
export function getRecallAccountChoices(): RecallAccountId[] {
  const choices: RecallAccountId[] = ["primary"];
  if (process.env.RECALL_SECONDARY_API_KEY) {
    getRecallAccount("secondary");
    choices.push("secondary");
  }
  return choices;
}
