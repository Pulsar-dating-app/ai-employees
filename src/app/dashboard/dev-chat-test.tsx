"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// TODO(C1-TEST-ONLY): delete alongside its API route
// (dev-chat-test/route.ts) once D2 ships and there's a real caller of
// AgentEngine.run() to test against instead. Not merchant-facing -- no i18n,
// same exception D1's dev-only test scaffolding used. Lives here (not under
// agents/[agentSlug]/) because both the marketplace agent detail page and
// the my-agents connections page render it, dev-only, each guarded by its
// own NODE_ENV check.

type ChatMessage = { role: "user" | "assistant"; content: string };

export function DevChatTest({
  companyId,
  agentSlug,
  agentName,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSend() {
    const text = draft.trim();
    if (!text || isSending) return;

    setErrorMessage(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setDraft("");
    setIsSending(true);

    const res = await fetch(`/api/companies/${companyId}/agents/${agentSlug}/dev-chat-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    setIsSending(false);

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      setErrorMessage(errorBody?.detail || errorBody?.error || "Something went wrong.");
      return;
    }

    const { responseText } = await res.json();
    setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="secondary" onClick={() => setIsOpen((v) => !v)}>
        {isOpen ? "Fechar chat de teste" : "Testar chat (dev)"}
      </Button>

      {isOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>Chat de teste (dev only)</CardTitle>
            <CardDescription>
              Conversa real com {agentName} via Agent Engine — consome sua OPENAI_API_KEY de verdade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-md border border-outline-variant bg-surface-container-low p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Manda uma mensagem pra começar.</p>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-on-primary"
                        : "max-w-[85%] self-start whitespace-pre-wrap rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                    }
                  >
                    {m.content}
                  </div>
                ))
              )}
              {isSending ? (
                <p className="text-sm text-on-surface-variant">{agentName} está digitando...</p>
              ) : null}
            </div>

            {errorMessage ? (
              <p role="alert" className="text-sm text-error">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Escreva uma mensagem..."
                disabled={isSending}
              />
              <Button type="button" onClick={handleSend} isLoading={isSending} disabled={!draft.trim()}>
                Enviar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
