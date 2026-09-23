"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useScrollSpy<K extends string>(keys: readonly K[]): [K, (key: K) => void] {
  const [active, setActive] = useState<K>(keys[0]);
  const lockUntil = useRef(0);

  useEffect(() => {
    function update() {
      if (Date.now() < lockUntil.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current: K = keys[0];
      for (const key of keys) {
        const node = document.querySelector(`[data-settings-section="${key}"]`);
        if (!node) continue;
        const top = node.getBoundingClientRect().top;
        const threshold = atBottom ? window.innerHeight - 120 : Math.max(140, window.innerHeight * 0.5);
        if (top <= threshold) current = key;
      }
      setActive(current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [keys]);

  const select = useCallback((key: K) => {
    lockUntil.current = Date.now() + 1500;
    setActive(key);
  }, []);

  return [active, select];
}
