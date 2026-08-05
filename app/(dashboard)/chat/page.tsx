import { CategoryChat } from "@/components/category-chat";
import { PageHeader } from "@/components/ui/page-header";

export default function CrossMeetingChatPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Ask"
        title="Chat across meetings"
        description="Scope to a category — or uncategorized — and ask Rika what was said across those calls."
      />
      <CategoryChat />
    </div>
  );
}
