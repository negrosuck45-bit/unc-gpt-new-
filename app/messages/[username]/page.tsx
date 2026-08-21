import { MessageThreadPage } from "@/components/message-thread-page";

export default async function MessageThreadRoute({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <MessageThreadPage username={decodeURIComponent(username)} />;
}
