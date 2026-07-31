import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { answerQuestion } from "@/lib/ai/rag";
import { getCurrentUserId } from "@/lib/auth";

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

  const userId = await getCurrentUserId();
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
