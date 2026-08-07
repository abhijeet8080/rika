import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { answerQuestion } from "@/lib/ai/rag";
import { getCurrentUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

export async function POST(request: Request) {
  const {
    messages,
    meetingId,
    categoryId,
    uncategorizedOnly,
  }: {
    messages: UIMessage[];
    meetingId?: string;
    categoryId?: string;
    uncategorizedOnly?: boolean;
  } = await request.json();

  if (!meetingId && !categoryId && !uncategorizedOnly) {
    return Response.json(
      { error: "One of meetingId, categoryId, or uncategorizedOnly is required" },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();

  const limited = await rateLimit("chat", userId);
  if (limited) return limited;

  const result = await answerQuestion(await convertToModelMessages(messages), {
    userId,
    meetingId,
    categoryId,
    uncategorizedOnly,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
