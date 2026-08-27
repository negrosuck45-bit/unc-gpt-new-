#!/usr/bin/env bash
set -euo pipefail

# Replace the visible mark first so later text substitutions cannot affect the path.
for file in \
  app/layout.tsx \
  app/[username]/page.tsx \
  app/api/profile/avatar/route.ts \
  app/fiz/page.tsx \
  components/chat-sidebar.tsx \
  components/first-open-onboarding.tsx \
  components/mars-avatar.tsx \
  components/messages-page.tsx \
  components/notifications-page.tsx \
  components/notifications-panel.tsx; do
  sed -i 's#/uncgpt\.png#/lunar.png#g' "$file"
done

# Product name shown to users in front-end pages and UI surfaces.
for file in \
  app/[username]/page.tsx \
  app/auth/error/page.tsx \
  app/fiz/page.tsx \
  app/privacy/page.tsx \
  app/terms/page.tsx \
  app/testintro/page.tsx \
  components/chat-sidebar.tsx \
  components/connector-permission-card.tsx \
  components/first-open-onboarding.tsx \
  components/message-thread-page.tsx \
  components/messages-page.tsx \
  components/notifications-page.tsx \
  components/notifications-panel.tsx \
  components/oauth-connectors.tsx \
  components/settings-page.tsx; do
  sed -i \
    -e 's/UncGPT/Lunar/g' \
    -e 's/uncgpt/Lunar/g' \
    -e 's/UNC-GPT/LUNAR/g' \
    "$file"
done

# Keep existing browser persistence keys stable, but make all displayed product and AI identities Lunar.
sed -i \
  -e 's/title: "uncgpt"/title: "Lunar"/g' \
  -e 's/UncGPT/Lunar/g' \
  -e 's#"/uncgpt\.png"#"/lunar.png"#g' \
  app/layout.tsx

sed -i \
  -e 's/You are UncGPT/You are Lunar/g' \
  -e 's/You are uncgpt/You are Lunar/g' \
  -e 's/uncgpt provides/Lunar provides/g' \
  -e 's/uncgpt vision/Lunar vision/g' \
  -e 's/UncGPT\/1\.0/Lunar\/1.0/g' \
  -e 's/compatible; UncGPT/compatible; Lunar/g' \
  -e 's#https://uncgpt\.app#https://unc-gptt.vercel.app#g' \
  -e 's/"UncGPT"/"Lunar"/g' \
  -e 's/"uncgpt-site"/"lunar-site"/g' \
  -e 's/"uncgpt"/"lunar"/g' \
  -e 's/uncgpt-site/lunar-site/g' \
  -e 's/by uncgpt/by Lunar/g' \
  -e 's/created by uncgpt/created by Lunar/g' \
  app/api/chat/route.ts

sed -i \
  -e 's/You are UncGPT/You are Lunar/g' \
  lib/chat-with-search.ts

sed -i \
  -e 's/value: "uncgpt"/value: "lunar"/g' \
  -e 's/label: "uncgpt"/label: "Lunar"/g' \
  -e 's/model: "uncgpt"/model: "lunar"/g' \
  lib/chat-store.ts

sed -i \
  -e "s/rp: { name: 'uncgpt'/rp: { name: 'Lunar'/g" \
  lib/passkey.ts

# The official system profile is now @lunar. Existing user data keys stay untouched.
sed -i \
  -e 's/"uncgpt"/"lunar"/g' \
  -e "s/'uncgpt'/'lunar'/g" \
  -e 's/@uncgpt/@lunar/g' \
  -e 's/official uncgpt/official Lunar/g' \
  -e 's/on uncgpt/on Lunar/g' \
  app/[username]/page.tsx app/api/profile/avatar/route.ts app/api/social/route.ts components/message-thread-page.tsx components/messages-page.tsx components/notifications-page.tsx components/notifications-panel.tsx

# Never publish a fake contact address after the rebrand.
sed -i \
  -e 's/uncgpt Clerk application/Lunar Clerk application/g' \
  -e 's#href="mailto:support@uncgpt\.com?subject=Social%20sign-in%20problem"#href="/feedback"#g' \
  app/auth/error/page.tsx
