# Visual Verification

The actual local Next.js app was rendered in Chromium at 1440×900 and 390×844. The desktop screenshot shows a centered compact Lunar card with balanced margins, a fully rounded outer shell, readable provider buttons, email field, disabled continue state, and rounded footer. The mobile screenshot shows the same card fitting within the viewport with 12px side margins, no visible horizontal overflow, fully rounded corners, stacked provider controls, readable text, and a footer that remains inside the card. The `Last used` badge stays within the provider row on mobile rather than overflowing beyond the viewport.

The local dev server returned HTTP 200 for `/` at both captures. Chromium emitted only the expected sandbox DBus warning and Next.js warned that `127.0.0.1` was not in `allowedDevOrigins` for the HMR resource; the page itself rendered successfully.
