function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get QDRANT_URL() {
    return required("QUADRANT_CLUSTER_ENDPOINT");
  },
  get QDRANT_API_KEY() {
    return required("QUADRANT_API_KEY");
  },
  get RECALL_API_KEY() {
    return required("RECALL_API_KEY");
  },
  get RECALL_API_REGION() {
    return required("RECALL_API_REGION");
  },
  get GEMINI_API_KEY() {
    return required("GEMINI_API_KEY");
  },
  get RECALL_WEBHOOK_SECRET() {
    return required("RECALL_WEBHOOK_SECRET");
  },
  get GOOGLE_OAUTH_CLIENT_ID() {
    return required("GOOGLE_OAUTH_CLIENT_ID");
  },
  get GOOGLE_OAUTH_CLIENT_SECRET() {
    return required("GOOGLE_OAUTH_CLIENT_SECRET");
  },
  get DEEPSEEK_API_KEY() {
    return required("DEEPSEEK_API_KEY");
  },
};
