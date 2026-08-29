# Recovery Audit Notes

## Observed production state

On 29 August 2026, the production domain `https://unc-gptt.vercel.app` showed the unwanted dark, vertically expanded Lunar authentication screen. It presented Google, Discord, GitHub, and email choices, but the visual presentation did not match the intended clean authentication baseline.

## Restored local baseline

The recovered local build at `http://localhost:3101` displays the prior compact, light authentication card over a restrained dark gradient. The restored screen retains first-party Google, Discord, GitHub, and email paths; the existing signed-session, CSRF-state, PKCE, and Safari handoff mechanics remain unchanged. The visible heading remains `Welcome to Lunar` to preserve the established product identity.

## Release status

The recovery changes are locally validated pending final responsive review, authorized source control push, and authorized deployment to the linked Vercel project.
