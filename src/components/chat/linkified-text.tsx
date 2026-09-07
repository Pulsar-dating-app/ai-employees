import { splitOnUrls } from "@/lib/chat/linkify";

// Renders a chat message with any http(s) URLs as real, clickable anchors.
// Drop-in for the `<p className="whitespace-pre-wrap">{content}</p>` both
// chat surfaces used. Links inherit the bubble's text colour (so they stay
// legible on the primary-coloured customer bubble) and just add an
// underline; `break-all` keeps a long checkout URL from overflowing.
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const segments = splitOnUrls(text);

  return (
    <p className={className}>
      {segments.map((segment, i) =>
        segment.type === "link" ? (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all underline underline-offset-2 hover:opacity-80"
          >
            {segment.value}
          </a>
        ) : (
          <span key={i}>{segment.value}</span>
        ),
      )}
    </p>
  );
}
