import Image from "next/image";
import clsx from "clsx";
import { ChatIcon, InstagramIcon, TelegramIcon, WhatsAppIcon } from "@/components/ui/icons";
import { avatarTint, initials } from "./inbox-format";

const CHANNEL_GLYPHS: Record<string, { Icon: typeof ChatIcon; color: string }> = {
  whatsapp: { Icon: WhatsAppIcon, color: "#1faa55" },
  instagram: { Icon: InstagramIcon, color: "#d62976" },
  telegram: { Icon: TelegramIcon, color: "#229ed9" },
  web_chat: { Icon: ChatIcon, color: "#3525cd" },
};

export function ChannelGlyph({ channel, className }: { channel: string; className?: string }) {
  const glyph = CHANNEL_GLYPHS[channel] ?? CHANNEL_GLYPHS.web_chat;
  return <glyph.Icon className={className} style={{ color: glyph.color }} />;
}

export function CustomerAvatar({
  seed,
  name,
  channel,
  size = "md",
}: {
  seed: string;
  name: string;
  channel?: string;
  size?: "md" | "lg";
}) {
  const tint = avatarTint(seed);
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={clsx(
          "flex items-center justify-center rounded-full font-semibold tracking-wide",
          size === "lg" ? "h-14 w-14 text-base" : "h-10 w-10 text-[13px]",
        )}
        style={tint}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      {channel ? (
        <span
          className={clsx(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-surface-container-lowest ring-2 ring-surface-container-lowest",
            size === "lg" ? "h-5 w-5" : "h-4 w-4",
          )}
        >
          <ChannelGlyph channel={channel} className={size === "lg" ? "h-3.5 w-3.5" : "h-3 w-3"} />
        </span>
      ) : null}
    </span>
  );
}

export function AgentAvatar({
  photoSrc,
  name,
  className,
}: {
  photoSrc: string | null;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-fixed",
        className ?? "h-6 w-6",
      )}
    >
      {photoSrc ? (
        <Image src={photoSrc} alt={name} fill sizes="48px" className="object-cover object-top" />
      ) : (
        <span className="text-[10px] font-semibold text-primary">{name.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
