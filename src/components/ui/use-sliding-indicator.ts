"use client";

import { useLayoutEffect, useRef } from "react";

export function useSlidingIndicator<T extends HTMLElement>(activeKey: string | null, version: unknown, axis: "x" | "y") {
  const itemRefs = useRef(new Map<string, T>());
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placedRef = useRef(false);

  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    const el = activeKey ? itemRefs.current.get(activeKey) : undefined;
    if (!indicator || !el) {
      if (indicator) indicator.style.opacity = "0";
      placedRef.current = false;
      return;
    }
    indicator.style.transition = placedRef.current ? "" : "none";
    indicator.style.opacity = "1";
    indicator.style.height = `${el.offsetHeight}px`;
    if (axis === "x") {
      indicator.style.top = `${el.offsetTop}px`;
      indicator.style.width = `${el.offsetWidth}px`;
      indicator.style.transform = `translateX(${el.offsetLeft}px)`;
    } else {
      indicator.style.transform = `translateY(${el.offsetTop}px)`;
    }
    placedRef.current = true;
  }, [activeKey, version, axis]);

  function register(key: string) {
    return (el: T | null) => {
      if (el) itemRefs.current.set(key, el);
      else itemRefs.current.delete(key);
    };
  }

  return { indicatorRef, register };
}
