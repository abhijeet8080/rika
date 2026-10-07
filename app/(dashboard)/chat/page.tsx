import { CategoryChat } from "@/components/category-chat";
import styles from "@/components/chat-workspace.module.css";

export default function CrossMeetingChatPage() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div><h1>Ask Rika</h1><p>Turn your meetings into answers.</p></div>
        <span>Less searching. More clarity.</span>
      </header>
      <CategoryChat />
    </div>
  );
}
