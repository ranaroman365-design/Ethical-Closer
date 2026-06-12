import { useEffect, useState, useCallback } from "react";

export type ThemePref = "light" | "dark" | "system";
const KEY = "etc-theme";

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = pref === "dark" || (pref === "system" && systemDark);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function initTheme() {
  const pref = (localStorage.getItem(KEY) as ThemePref | null) ?? "system";
  applyTheme(pref);
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(
    () => (typeof window !== "undefined" && (localStorage.getItem(KEY) as ThemePref | null)) || "system"
  );

  // React to system changes when in "system" mode
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [pref]);

  const set = useCallback((next: ThemePref) => {
    localStorage.setItem(KEY, next);
    setPref(next);
    applyTheme(next);
  }, []);

  return { pref, set };
}
