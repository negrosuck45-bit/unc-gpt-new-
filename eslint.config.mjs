import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "public/**",
    "coverage/**",
    "dist/**",
  ]),
  {
    files: [
      "components/auth-panel.tsx",
      "components/chat-messages.tsx",
      "components/settings-dialog.tsx",
      "components/settings-page.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["tests/**/*.mjs"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
    },
  },
])
