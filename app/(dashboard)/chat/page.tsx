import { CategoryChat } from "@/components/category-chat";
import { PageHeader } from "@/components/ui/page-header";

export default function CrossMeetingChatPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Ask about your meetings"
        description="Scope your question to a category, or search everything uncategorized."
      />
      <CategoryChat />
    </div>
  );
}
