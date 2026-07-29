import { ChatPanel } from "@/components/chat-panel";

export default function CrossMeetingChatPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ask across all meetings</h1>
      <ChatPanel />
    </div>
  );
}
