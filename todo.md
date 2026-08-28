# Project TODO

- [x] Inspect the existing Cloudflare gateway, voice API, response actions, language preferences, localization, and Lunar authentication UI
- [x] Implement multilingual localization for the selected language, including core interface text
- [x] Implement Cloudflare Deepgram Aura-2-ES as the primary speech provider with selected-language synthesis and playback
- [x] Normalize generated audio and enforce one active playback at a time with stale-resource cleanup
- [x] Use browser SpeechSynthesis only as an explicit language-aware fallback after primary voice failure
- [x] Keep a speaker control beside like/dislike under every AI response
- [x] Expand language support beyond the current limited set, including Hindi, Italian, and English
- [x] Resize and fully round the Lunar authentication card with mobile-safe layout and no horizontal overflow
- [x] Add or update automated tests for voice behavior, localization, and responsive/auth contracts
- [x] Verify desktop and mobile layouts, voice behavior, linting, type checks, and production build (local contracts/lint/type-check/compile passed; Vercel production build is READY)
- [x] Commit verified changes to main so the linked Vercel project auto-deploys
- [x] Confirm the Vercel deployment status and report the deployed release
- [x] Fix inherited FIZ CSS-module purity and error-route prerender blockers so the production build completes (confirmed by READY Vercel production deployment)
- [x] Repair inherited repository-wide TypeScript failures so the full type check can pass cleanly
