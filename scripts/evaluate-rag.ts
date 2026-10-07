import { readFile } from "node:fs/promises";
import { z } from "zod";
import { retrieveChunks, type ChatScope } from "@/lib/ai/rag";

const EvalCaseSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  scope: z.object({
    userId: z.string().uuid(),
    meetingId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    uncategorizedOnly: z.boolean().optional(),
  }),
  /** One or more chunk ids that must appear in the retrieved context. */
  expectedChunkIds: z.array(z.string().uuid()).min(1),
});

const EvalFileSchema = z.array(EvalCaseSchema).min(1);

async function main() {
  const path = process.env.RAG_EVAL_CASES_PATH;
  if (!path) {
    throw new Error("Set RAG_EVAL_CASES_PATH to a JSON evaluation-case file.");
  }

  const cases = EvalFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const results = [];

  for (const testCase of cases) {
    const retrieved = await retrieveChunks(testCase.question, testCase.scope as ChatScope);
    const retrievedIds = new Set(retrieved.map((chunk) => chunk.id));
    const hits = testCase.expectedChunkIds.filter((id) => retrievedIds.has(id));
    results.push({
      id: testCase.id,
      recallAtContext: hits.length / testCase.expectedChunkIds.length,
      expected: testCase.expectedChunkIds.length,
      found: hits.length,
      passed: hits.length === testCase.expectedChunkIds.length,
    });
  }

  const passed = results.filter((result) => result.passed).length;
  console.table(results);
  console.log(`RAG evaluation: ${passed}/${results.length} cases passed.`);
  if (passed !== results.length) process.exitCode = 1;
}

void main();
