UNC-GPT FULL FIXED VERSION

API KEYS: All embedded in code
Status: Ready to deploy

SETUP:

1. Extract and install:
   unzip unc-gpt-fixed.zip
   cd unc-gpt-final
   npm install

2. Edit .env.local with Supabase only:
   NEXT_PUBLIC_SUPABASE_URL=your_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_key

3. Run:
   npm run dev

4. Open:
   http://localhost:3000

API KEYS LOCATION:

All API keys are hardcoded in: app/api/chat/route.ts

- GROQ_KEYS (3 keys)
- CHAT_WORKER_URLS (7 Cloudflare workers)
- IMAGE_VIDEO_WORKER_URL
- Models configured for image/video generation

If you need to update keys, edit them directly in app/api/chat/route.ts

NO external provider dependencies - everything is self-contained.

Features:
- Groq chat (llama, deepseek, mixtral models)
- Cloudflare image generation (flux, stable diffusion)
- Video generation (pollinations)
- GitHub integration
- Tool execution
- Vision models
- Attachment processing

Ready to run.
