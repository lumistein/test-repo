import { ChatShell } from "@/components/chat-shell";

export default function Home() {
  const siteTitle = process.env.SITE_TITLE ?? "Gemma Chat";
  const siteDescription =
    process.env.SITE_DESCRIPTION ?? "설정 없이 바로 대화할 수 있는 전용 공개 채팅";

  return <ChatShell title={siteTitle} description={siteDescription} />;
}
