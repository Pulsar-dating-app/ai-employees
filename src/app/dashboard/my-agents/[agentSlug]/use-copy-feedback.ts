"use client";

import { useState } from "react";

// Trello D6 -- extracted from the old share-embed-section.tsx (now split
// into direct-link-section.tsx / embed-snippet-section.tsx, one per tab) so
// both keep the exact same copy-to-clipboard behavior without duplicating
// it.
export function useCopyFeedback() {
  const [copied, setCopied] = useState(false);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser/OS (permissions,
      // insecure context) -- leave the button inert rather than crash; the
      // value is still fully visible/selectable in the field either way.
    }
  }

  return { copied, copy };
}
