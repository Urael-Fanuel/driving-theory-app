# Launch Checklist — Ethiopian Driving Theory App

## ✅ Phase 1: Content (Agent 1)
- [x] `content/signs.json` — 60 signs, 3 questions each = 180 questions
- [x] `content/topics.json` — 6 topics
- [x] `scripts/generateAllAudio.ts` — Google TTS script ready
- [x] `scripts/generateVideos.ts` — FFmpeg video generation ready
- [ ] Run `generateAllAudio.ts` with Google TTS credentials → `assets/audio/` (600+ files)
- [ ] Create or source 60 traffic sign PNGs → `assets/images/`
- [ ] Run `generateVideos.ts` with FFmpeg → `assets/videos/` (60 MP4 files)

## ✅ Phase 2: Backend (Agent 2)
- [x] `backend/schema.sql` — Run in Supabase SQL editor
- [x] `backend/supabaseClient.ts`
- [x] `backend/api.ts` — All data functions with mock fallback
- [x] `backend/mockData.ts`
- [x] `backend/uploadContent.ts`
- [ ] Create Supabase project at supabase.com
- [ ] Run `schema.sql` in Supabase SQL editor
- [ ] Set environment variables:
  ```
  EXPO_PUBLIC_SUPABASE_URL=https://[project].supabase.co
  EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
  SUPABASE_SERVICE_ROLE_KEY=[service-key]
  ```
- [ ] Run `uploadContent.ts`: `npx ts-node backend/uploadContent.ts`

## ✅ Phase 3: UI (Agent 3)
- [x] `app/_layout.tsx` — Root layout
- [x] `app/index.tsx` — Engine selection screen
- [x] `app/(engineA)/` — All Engine A screens
- [x] `app/(engineB)/` — All Engine B screens
- [x] `app/result/[sessionId].tsx` — Exam results
- [x] All shared components
- [x] All Engine A components
- [x] All Engine B components
- [ ] Install npm dependencies: `npm install`
- [ ] Install Expo packages: `npx expo install expo-av expo-haptics expo-file-system expo-speech`
- [ ] Install navigation: `npx expo install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context`
- [ ] Install video: `npx expo install react-native-video`
- [ ] Install gestures: `npx expo install react-native-gesture-handler react-native-reanimated`

## ✅ Phase 4: Voice (Agent 4)
- [x] `services/speechRecognition.ts`
- [x] `hooks/useVoiceRecognition.ts`
- [x] `components/engineA/VoiceAnswerButton.tsx`
- [ ] Set `EXPO_PUBLIC_GOOGLE_STT_KEY` in `.env`
- [ ] Enable Google Cloud Speech-to-Text API
- [ ] Test voice recognition on real device with Amharic speakers
- [ ] Verify phrase hints improve accuracy

## ✅ Phase 5: Video & Media (Agent 5)
- [x] `components/engineA/SignVideoPlayer.tsx`
- [x] `services/audioCache.ts`
- [x] `hooks/useVideoPlayer.ts`
- [ ] Configure `react-native-video` native plugin in `app.json`
- [ ] Test video playback on Android API 26+
- [ ] Test offline caching with airplane mode
- [ ] Verify audio cache directory permissions

## Phase 6: QA & Launch
- [ ] Run on physical Android device (low-end: Snapdragon 450)
- [ ] Run on physical Android device (mid-range: Snapdragon 665+)
- [ ] Test Engine A full flow without any text reading
- [ ] Test Engine B full flow with Amharic readers
- [ ] Test all 60 signs in both engines
- [ ] Test exam mode (30 questions, timer, results)
- [ ] Test voice recognition with native Amharic speakers
- [ ] Test offline mode (airplane mode)
- [ ] Verify app size < 50MB (without media)
- [ ] Verify cold start < 3 seconds
- [ ] Submit to Google Play Store

## Environment Variables Summary
```env
# Required for Supabase (live data)
EXPO_PUBLIC_SUPABASE_URL=https://[project].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-key]  # Only for upload scripts

# Required for voice recognition (Engine A)
EXPO_PUBLIC_GOOGLE_STT_KEY=[google-api-key]

# Required for audio generation script
EXPO_PUBLIC_GOOGLE_TTS_KEY=[google-api-key]
# Also set GOOGLE_APPLICATION_CREDENTIALS for service account
```

## Development Mode (No Backend)
Run without any environment variables — app uses mock data from `content/signs.json`:
```bash
npm install
npx expo start
```
