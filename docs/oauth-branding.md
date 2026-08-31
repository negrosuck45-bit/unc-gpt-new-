# Lunar OAuth branding

The application now redirects a successful OAuth callback to `/` with a private, no-store response, and the home route is forced dynamic so a returning session cannot receive a cached logged-out onboarding shell.

The text shown inside Google's hosted sign-in and consent pages is controlled by the Google Cloud OAuth consent-screen configuration, not by the application HTML. Set the app name, logo, support email, authorized domains, and branding there so the provider can display Lunar. The callback hostname is controlled by the OAuth redirect URI. To avoid `unc-gptt.vercel.app` in that provider-managed surface, configure a verified Lunar custom domain (for example `auth.lunar.example`) in Vercel and Google Cloud, set `LUNAR_APP_URL` to that exact HTTPS origin through the deployment secret manager, and register `https://auth.lunar.example/api/auth/google/callback` as an authorized redirect URI. Do not put a domain in code that has not been verified and registered with Google; doing so will cause OAuth redirect_uri_mismatch errors.

The app cannot truthfully hide a redirect hostname from Google's own UI through a frontend label. Once the verified custom origin is used for the OAuth start and callback flow, Google may show that custom origin, while the provider's configured application name remains Lunar.
