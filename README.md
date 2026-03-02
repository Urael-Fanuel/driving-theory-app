# ሹፌርነት ትምህርት — Ethiopian Driving Theory App

An Amharic-language driving theory learning app for the Ethiopian community, featuring two parallel learning engines for readers and non-readers.

## Two Learning Engines

| Feature | Engine A (Non-reader) | Engine B (Amharic reader) |
|---------|----------------------|--------------------------|
| Learn   | 📹 Video per sign     | 📖 Text explanation       |
| Answer  | 🎤 Say "አንድ/ሁለት/ሶስት" | 👆 Tap written answer     |
| Feedback| 🔊 Audio only         | 📝 Text + optional audio  |
| Text    | ❌ Zero text shown     | ✅ Full Amharic text       |

## Project Structure

```
driving-theory-app/
├── app/                          # expo-router screens
│   ├── _layout.tsx               # Root layout + EngineProvider
│   ├── index.tsx                 # Engine selection (onboarding)
│   ├── (engineA)/                # Non-reader engine
│   │   ├── home.tsx              # Topic icon grid
│   │   ├── topic/[id].tsx        # Sign image grid
│   │   ├── sign/[id].tsx         # Video player screen
│   │   ├── question/[id].tsx     # Voice answer screen
│   │   ├── exam.tsx              # 30-question exam
│   │   └── progress.tsx          # Visual progress
│   ├── (engineB)/                # Amharic reader engine
│   │   ├── home.tsx              # Topic list with text
│   │   ├── topic/[id].tsx        # Sign list with names
│   │   ├── sign/[id].tsx         # Sign detail + explanation
│   │   ├── question/[id].tsx     # Text answer screen
│   │   ├── exam.tsx              # 30-question exam
│   │   └── progress.tsx          # Detailed text progress
│   └── result/[sessionId].tsx    # Exam results (shared)
│
├── components/
│   ├── shared/                   # Used by both engines
│   ├── engineA/                  # Non-reader specific
│   └── engineB/                  # Reader specific
│
├── hooks/                        # Custom React hooks
├── services/                     # External services (STT, cache)
├── contexts/                     # React context providers
├── constants/                    # Colors, typography, strings
│
├── backend/                      # Supabase integration
│   ├── schema.sql                # Database schema + RLS
│   ├── supabaseClient.ts         # Typed Supabase client
│   ├── api.ts                    # Data access functions
│   ├── mockData.ts               # Offline dev data
│   └── uploadContent.ts          # One-time seed script
│
├── content/                      # Agent 1 generated content
│   ├── signs.json                # 60 signs × 3 questions = 180 Q
│   └── topics.json               # 6 topics
│
└── scripts/                      # Content generation scripts
    ├── generateAllAudio.ts       # Google TTS → assets/audio/
    └── generateVideos.ts         # FFmpeg → assets/videos/
```

## Quick Start (Development Mode)

No backend required — app works offline with mock data.

```bash
# Install dependencies
npm install
npx expo install expo-av expo-haptics expo-file-system expo-speech expo-router
npx expo install react-native-gesture-handler react-native-reanimated
npx expo install react-native-safe-area-context react-native-screens

# Start development server
npx expo start

# Run on Android
npx expo start --android
```

## Full Setup (Production)

### 1. Generate audio files
```bash
# Set Google Cloud credentials
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
npx ts-node scripts/generateAllAudio.ts
```

### 2. Create sign images
Place 60 PNG traffic sign images in `assets/images/` matching filenames in `content/signs.json`.

### 3. Generate videos
```bash
# Requires ffmpeg installed
npx ts-node scripts/generateVideos.ts
```

### 4. Setup Supabase
1. Create project at [supabase.com](https://supabase.com)
2. Run `backend/schema.sql` in SQL Editor
3. Set environment variables in `.env`
4. Upload content: `npx ts-node backend/uploadContent.ts`

### 5. Environment variables
```env
EXPO_PUBLIC_SUPABASE_URL=https://[project].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-key]
EXPO_PUBLIC_GOOGLE_STT_KEY=[google-api-key]
EXPO_PUBLIC_GOOGLE_TTS_KEY=[google-api-key]
```

## Content Stats
- **60 traffic signs** across 6 topics
- **180 questions** (3 per sign)
- **6 topics**: regulatory, warning, information, road_markings, right_of_way, safety
- **Pass threshold**: 24/30 (80%)

## Tech Stack
- **React Native** (Expo ~51)
- **expo-router** v3 (file-based routing)
- **Supabase** (PostgreSQL + Storage + Auth)
- **Google Cloud TTS** (Amharic `am-ET-Standard-A`)
- **Google Cloud STT** (Amharic `am-ET`)
- **react-native-video** (video playback)
- **expo-av** (audio playback + recording)
- **expo-haptics** (tactile feedback)

## Target Platform
- Android 8+ (API 26+)
- Minimum network: 3G
- App size: < 50MB without media
- Optimized for low-end devices (Snapdragon 450 equivalent)
