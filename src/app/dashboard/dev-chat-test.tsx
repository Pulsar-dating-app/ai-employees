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

// C7's step-10 outcome, echoed by the route purely so this panel can make a
// grounding intervention visible while hand-testing -- a blocked reply
// otherwise just looks like Malu being vague for no reason.
type Grounding = {
  status: "grounded" | "regenerated" | "blocked";
  violations: { kind: string; text: string }[];
};

// The arguments the model chose for each tool call. For a search these are
// the closest thing to seeing her reasoning: they are the decision she
// made, and they appear in no log anywhere else.
type ToolCall = { name: string; args: Record<string, unknown>; resultCount: number | null; resultNames: string[] };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  grounding?: Grounding;
  toolCalls?: ToolCall[];
};

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

    const { responseText, grounding, toolCalls } = await res.json();
    setMessages((prev) => [...prev, { role: "assistant", content: responseText, grounding, toolCalls }]);
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
                  <div key={i} className={m.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}>
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-on-primary"
                          : "max-w-[85%] whitespace-pre-wrap rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                      }
                    >
                      {m.content}
                    </div>
                    {m.toolCalls?.map((call, ci) => (
                      <p key={ci} className="mt-1 max-w-[85%] text-xs text-on-surface-variant">
                        🔎 {call.name}({Object.entries(call.args)
                          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
                          .join(" | ")}
                        ){call.resultCount === null ? null : ` → ${call.resultCount}`}
                        {call.resultNames.length > 0 ? `: ${call.resultNames.join(", ")}` : null}
                      </p>
                    ))}
                    {/* Shown on every reply, including the passing case: a
                        badge that only appears on failure makes "nothing here"
                        ambiguous between "the check passed" and "the check
                        never ran", which is the one question a test panel has
                        to answer. */}
                    {m.grounding ? (
                      <p className="mt-1 max-w-[85%] text-xs text-on-surface-variant">
                        {m.grounding.status === "blocked"
                          ? "⛔ Resposta bloqueada (grounding)"
                          : m.grounding.status === "regenerated"
                            ? "♻️ Resposta refeita (grounding)"
                            : "✅ Grounding ok"}
                        {m.grounding.violations.length > 0
                          ? ` — sem origem: ${m.grounding.violations.map((v) => v.text).join(", ")}`
                          : null}
                      </p>
                    ) : null}
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
