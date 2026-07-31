import { CategoryChat } from "@/components/category-chat";

export default function CrossMeetingChatPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ask about your meetings</h1>
      <CategoryChat />
    </div>
  );
}
