type Translator = {
  (key: string): string;
  has?: (key: string) => boolean;
};

// `conversation_channel` grows with every new workplace an agent gets, and a
// missing message key renders the raw path ("Conversations.channel.whatsapp")
// straight into the merchant's inbox -- which is exactly what happened to
// whatsapp and telegram between shipping those channels and translating them.
// Falling back to the slug keeps a future fifth channel merely unpolished
// instead of visibly broken.
export function channelLabel(t: Translator, channel: string): string {
  const key = `channel.${channel}`;
  if (typeof t.has === "function" && !t.has(key)) return prettifySlug(channel);
  try {
    return t(key);
  } catch {
    return prettifySlug(channel);
  }
}

function prettifySlug(channel: string): string {
  return channel
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
