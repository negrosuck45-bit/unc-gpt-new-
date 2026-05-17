# UNC-GPT MERGED FULL VERSION

This is the complete merged version combining both UNC-GPT packages with all features, tools, and components.

## What's Included

### ✅ API Routes
- **Chat & Conversations**: Full chat interface with conversation history
- **Computer Use**: Integration for computer vision and control
- **Tool Chain**: chat-with-tools with comprehensive built-in tools
- **Web Tools**: Web search, page fetching, file I/O
- **Image Processing**: Imagine endpoint for image generation
- **Website Builder**: Website generation and code output
- **Feedback System**: User feedback collection
- **OAuth Integration**: Multi-provider OAuth connectors (GitHub, etc.)
- **Upload**: Image and file upload capabilities

### ✅ Components
- **Chat Interface** (V1, V2, Computer Use variant)
- **Chat Messages** with code block support
- **Chat Input** with attachment handling
- **Memory System** with export/import
- **Settings & Configuration**
- **Skills Panel**
- **Voice Chat Support**
- **Computer Use Steps Display**
- **60+ UI Components** from shadcn/ui
- **Theme Provider** with dark/light mode

### ✅ Pages
- Main chat page
- Access control page
- Feedback page
- Voice page
- Website builder
- Camera test
- OSINT tools
- Spotify integration
- Globe visualization
- Testing/intro pages

### ✅ Libraries & Services
- **Agent Service** with tool execution
- **Memory System** with neural memory
- **Chat Store** for state management
- **Supabase Integration** (client/server)
- **File & Link Reader**
- **Attachment Processor**
- **Storage Offload**
- **Custom Model Service**
- **Auto-detection** for agent capabilities

### ✅ Built-in Tools
1. **Web Search** (DuckDuckGo)
2. **Page Fetching** (with HTML parsing)
3. **File Operations** (read/write)
4. **Computer Use Tools** (if available)
5. **Vision & Image Processing**

### ✅ Configuration
- TypeScript configuration
- Next.js 14+ setup
- Tailwind CSS
- PostCSS
- Components.json for shadcn/ui
- Environment setup (.env.local template)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your API keys

# Run development server
npm run dev
```

## Key Features

✨ **Multi-model Support** - Claude, OpenAI, Custom Models
🔍 **Web Research** - Built-in web search and page fetching
💾 **Memory System** - Neural memory and persistent conversations
🖥️ **Computer Use** - Vision-based task automation
🎨 **Website Builder** - AI-powered website generation
🔐 **OAuth Integration** - GitHub and other providers
📱 **Voice Chat** - Speech input and output
🎯 **OSINT Tools** - Open-source intelligence gathering
🌍 **Spotify Integration** - Music data access

## Documentation Files Included

- COMPUTER_USE_INTEGRATION.md - Computer vision setup
- DEPLOYMENT_GUIDE.md - Production deployment
- SETUP_COMPLETE.md - Initial setup checklist
- FIXES_AND_NEW_FEATURES.md - Latest improvements
- Multiple FIXES_ROUND files documenting bug fixes

## File Structure

```
unc-gpt-merged/
├── app/
│   ├── api/              # All API routes
│   ├── (pages)/          # Application pages
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   └── globals.css       # Global styles
├── components/           # React components
├── lib/                  # Utilities and services
├── hooks/                # Custom React hooks
├── public/               # Static assets
├── types/                # TypeScript types
├── package.json
├── tsconfig.json
└── next.config.mjs
```

## Environment Variables Required

See .env.local for required API keys:
- Anthropic API key
- OpenAI API key (optional)
- Supabase credentials
- Custom model endpoints
- OAuth provider tokens

## Notes

This is the complete production-ready version with all features, tools, and integrations fully implemented. All components are tested and the codebase includes multiple rounds of fixes and enhancements.

Build Status: ✅ Complete & Ready
