import { createGoogle, type GoogleEmbeddingModelOptions } from "@ai-sdk/google";
import { embed, embedMany } from "ai";
import { env } from "@/lib/env";
import { EMBEDDING_DIMENSIONS } from "@/lib/vector/client";

// Lazy — reading env.GEMINI_API_KEY at module load time would make any
// build that imports this file fail before the key is even needed.
let embeddingModel: ReturnType<
  ReturnType<typeof createGoogle>["embedding"]
> | undefined;

function getEmbeddingModel() {
  if (!embeddingModel) {
    const google = createGoogle({ apiKey: env.GEMINI_API_KEY });
    embeddingModel = google.embedding("gemini-embedding-001");
  }
  return embeddingModel;
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: "RETRIEVAL_QUERY",
      } satisfies GoogleEmbeddingModelOptions,
    },
  });
  return embedding;
}

export async function embedChunks(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values: texts,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: "RETRIEVAL_DOCUMENT",
      } satisfies GoogleEmbeddingModelOptions,
    },
  });
  return embeddings;
}
