"use client";

import { useEffect, useState, type ReactNode } from "react";

// Wraps the fixed nav so it can react to scroll position — the header
// starts translucent over the hero's shader wash and settles into a
// solid, more elevated bar once content scrolls under it. Pure UX chrome,
// not a decorative entrance, so it sits outside the page's one animated
// "wow" moment (see architecture.md).
export function ScrollHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent bg-white/80 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl transition-[background-color,box-shadow,border-color] duration-300 ease-out data-[scrolled]:border-[#eae6f4] data-[scrolled]:bg-white/95 data-[scrolled]:shadow-[0_8px_30px_rgba(15,23,42,0.08)]"
    >
      {children}
    </header>
  );
}
