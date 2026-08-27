"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

const THEME_CHROME = {
  light: "#f4f4f5",
  white: "#f4f4f5",
  dark: "#101011",
  gray: "#292929",
  "dark-gray": "#292929",
  system: "#292929",
} as const;

export function ThemeChrome() {
  const { theme } = useTheme();

  useEffect(() => {
    const activeTheme = theme ?? "gray";
    const color = THEME_CHROME[activeTheme as keyof typeof THEME_CHROME] ?? THEME_CHROME.gray;
    const colorScheme = activeTheme === "light" || activeTheme === "white" ? "light" : "dark";

    document.documentElement.style.colorScheme = colorScheme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((element) => {
      element.setAttribute("content", color);
    });
  }, [theme]);

  return null;
}
