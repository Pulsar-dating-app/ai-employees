"use client";

import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ShareEmbedSection } from "./share-embed-section";

// Trello M6 -- alongside (not replacing) the WhatsApp channels card. The
// direct link and embed snippet themselves are unchanged (M5's widget.js,
// M4's /talk/ page) -- ShareEmbedSection renders directly in this card's
// content, no button/dialog step in between.
export function WebChatChannelCard({
  agentName,
  chatUrl,
  embedSnippet,
}: {
  agentName: string;
  chatUrl: string;
  embedSnippet: string;
}) {
  const t = useTranslations("MyAgents.webChat");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ShareEmbedSection agentName={agentName} chatUrl={chatUrl} embedSnippet={embedSnippet} />
      </CardContent>
    </Card>
  );
}
