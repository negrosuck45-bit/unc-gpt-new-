# Groq TTS findings

The official Groq TTS documentation confirms the speech endpoint is `https://api.groq.com/openai/v1/audio/speech` and lists `canopylabs/orpheus-v1-english` and `canopylabs/orpheus-arabic-saudi` as the supported TTS models. The API accepts `model`, `input`, `voice`, and `response_format`, with WAV as the documented default/output format. Source: https://console.groq.com/docs/text-to-speech

Production runtime logs for deployment `dpl_9bYrjiyoPmsCLBRJwEXkpNJNK4Ki` show the key is now read, but Groq rejects `canopylabs/orpheus-v1-english` with HTTP 400 because the organization must accept the model terms. The old missing-key error belongs to deployment `dpl_9rF4t3HjQoXoe8E8VRs7Q6FUAc2Z`. Source: Vercel runtime error output captured on 2026-08-28.

Groq’s official Orpheus page lists the English voices as `autumn`, `diana`, `hannah`, `austin`, `daniel`, and `troy`, and states the model input maximum is 200 characters and the only supported response format is WAV. Source: https://console.groq.com/docs/text-to-speech/orpheus

The Groq model page for PlayAI Dialog v1.0 describes multilingual English/Arabic TTS but does not provide a confirmed speech endpoint model ID in the extracted page. Source: https://console.groq.com/docs/model/playai-tts
