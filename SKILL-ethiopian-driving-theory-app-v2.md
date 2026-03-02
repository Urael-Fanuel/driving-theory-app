# SKILL: Ethiopian Community Driving Theory App — v2.0

## Core Problem Statement
Two distinct user groups with fundamentally different learning paths:

| Feature | Group A (Non-readers) | Group B (Amharic readers) |
|---|---|---|
| Signs/Icons | 📹 Short video + Audio explanation | 📝 Written text explanation |
| Questions | 🎤 Voice input answer | ✅ Tap written answer |
| Feedback | 🔊 Audio: "ትክክል" / "ስህተት" + audio reason | 📝 Text + audio reason |
| Navigation | Icon + Audio only | Icon + Text + Audio |
| Content delivery | Video → Listen → Speak answer | Read → Choose → Read feedback |

---

## Architecture Principle: Two Parallel Learning Engines

The app is NOT one app with a language switch. It is **two complete learning engines** sharing the same question bank and video assets. The user selects their engine on first launch, and the entire UX shifts accordingly.

---

## Content Architecture Per Traffic Sign/Topic

### Every Traffic Sign Card Contains:
```
sign_content/
├── video/
│   ├── {sign_id}_amharic.mp4     # Short 15-30sec video, Amharic narration, shows sign in real road context
│   └── {sign_id}_thumbnail.jpg   # Video thumbnail
├── audio/
│   ├── {sign_id}_name.mp3        # Name of the sign in Amharic (2-3 seconds)
│   ├── {sign_id}_explanation.mp3 # Full explanation audio (15-20 seconds)
│   └── {sign_id}_question_{n}.mp3 # Audio of each question about this sign
├── image/
│   └── {sign_id}.png             # Official sign image (high resolution)
└── text/
    └── {sign_id}_amharic.json    # Written Amharic explanation + questions
```

### Video Content Requirements
- Duration: 15–30 seconds max per sign
- Shows: The sign image → zooms in → real road footage showing the sign → narrator explains in Amharic
- No text in video (non-readers)
- Captions available (toggle for readers)
- Amharic narration audio, clear pronunciation
- Video must be watchable at 0.75x speed (for slower learners)
- Format: MP4, H.264, 480p minimum (data-efficient for mobile)
- Offline: Videos downloadable per topic pack

---

## Two Learning Engines — Detailed Spec

---

### ENGINE A: NON-READER ENGINE (Group A)

**Flow for learning a sign:**
```
1. Home → Topic grid (icons only, taps play topic name audio)
2. Topic → Grid of sign images/icons
3. Tap sign → Full screen VIDEO auto-plays
4. Video ends → PLAY button appears (replay)
5. Below video: "Test yourself" button (microphone icon)
6. Tap microphone → Question plays as audio
7. 3 answer choices appear as IMAGES/ICONS only (no text)
8. User says "አንድ" (one), "ሁለት" (two), or "ሶስት" (three) OR taps the image
9. STT recognizes number/word → maps to answer choice
10. Audio feedback: "✅ ትክክል ነው! ምክንያቱም..." OR "❌ ስህተት ነው! ትክክለኛው መልስ..."
11. Next question or back to sign list
```

**Voice Answer System (Critical Design Decision):**
- User is NEVER asked to say the full answer in words
- User says ONLY: "አንድ" (1), "ሁለት" (2), "ሶስት" (3) OR "ሀ", "ለ", "ሐ"
- STT must recognize ONLY these 6 Amharic words → maps to answer A, B, or C
- Fallback: If STT confidence < 80% → "ዳግም ሞክር" (try again) prompt
- Alternative fallback: Large tap targets on images (if voice fails, tap works)
- Voice input timeout: 8 seconds, then prompt "ዳግም ሞክር"
- **NEVER depend solely on voice** — tap always works as backup

**Voice Recognition Implementation:**
- Primary: Google Cloud Speech-to-Text API (Amharic am-ET)
- Optimized for: Only needs to recognize {"አንድ", "ሁለት", "ሶስት", "ሀ", "ለ", "ሐ", "ትክክል", "ስህተት"}
- Use `speechContexts` with these specific phrases for higher accuracy
- Record audio: `expo-av` recording → send to Google STT API → parse result

---

### ENGINE B: AMHARIC READER ENGINE (Group B)

**Flow for learning a sign:**
```
1. Home → Topic grid (icon + Amharic text label)
2. Topic → List of signs with image + Amharic name text
3. Tap sign → Detail screen:
   - Sign image (large)
   - Amharic written explanation (full text)
   - Audio button to hear explanation (optional)
   - "Practice Questions" button
4. Questions screen:
   - Written question in Amharic
   - 3 written answer choices (tap to select)
   - Audio play button for each question and each answer (optional)
   - Submit → Written feedback + audio
5. Feedback: "✅ ትክክለኛ ነው!" + written explanation + audio button
```

**Optional Video for Group B:**
- A "Watch Video" button available on sign detail page
- But primary learning is text-based
- Reader can choose: read only / watch video / both

---

## Exam Simulation Mode

### Group A Exam:
- 30 questions, each with sign image + audio question
- Answer by voice (say "አንድ/ሁለት/ሶስት") or tap image
- Timer shown as progress circle (no text countdown)
- End: Audio result + large visual: ✅ (pass) or ❌ (fail) + score as large number

### Group B Exam:
- 30 written questions (same bank)
- Tap written answers
- Timer shown as text + progress circle
- End: Written + audio result + detailed breakdown by topic

---

## Technical Architecture

### Frontend: React Native (Expo)
```
expo-av          → Video playback + Audio playback + Recording
expo-speech      → TTS for on-device text-to-speech (backup)
expo-haptics     → Haptic feedback on all interactions
expo-file-system → Local caching of videos and audio
@react-navigation → Screen navigation
react-native-video → Advanced video player with controls
```

### Backend: Supabase
```
Tables:
- signs          (sign data, image_url, video_url, topic_id)
- sign_content   (amharic_text, explanation, questions JSON)
- topics         (name, icon, color, order)
- users          (id, engine_type A|B, progress JSON)
- exam_sessions  (user_id, score, passed, duration, answers JSON)

Storage Buckets:
- videos/        (sign videos, 15-30sec each)
- audio/         (question audio, explanation audio)
- images/        (sign images)
```

### External APIs
```
Google Cloud STT  → Amharic speech recognition (am-ET)
                    Used ONLY for Group A voice answers
                    Configured with phrase hints for numbers
                    
Google Cloud TTS  → Amharic text-to-speech (am-ET-Wavenet-A)
                    Pre-generate all audio offline
                    
OR: ElevenLabs    → Higher quality voice, supports Amharic
                    More expensive but more natural
```

### Video Production Pipeline
```
Option A (Professional): Hire Amharic-speaking narrator + videographer
  - Record real road footage per sign
  - Add narration + subtitles
  - Edit to 15-30 sec clips
  - Cost: ~$20-50 per sign × 100+ signs = significant investment

Option B (Programmatic with AI):
  - Use sign image + AI-generated Amharic narration (ElevenLabs)
  - Ken Burns effect (pan/zoom on image)
  - Add real road context from stock footage
  - Assemble with FFmpeg
  - Cost: much lower, can scale to all signs
  
RECOMMENDATION: Option B for MVP, Option A for premium version
```

### FFmpeg Video Generation Script
```bash
# Generate video from sign image + audio + stock footage
ffmpeg -loop 1 -i sign_{id}.png -i narration_{id}.mp3 \
  -vf "zoompan=z='min(zoom+0.0015,1.5)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',format=yuv420p" \
  -c:v libx264 -t 20 -pix_fmt yuv420p output_{id}.mp4
```

---

## Multi-Agent Build Plan

### Agent 1: Content & Translation Agent
**Deliverables:**
- `content/signs.json` — all 100+ signs with Amharic names + explanations
- `content/questions.json` — 1,700 questions with Amharic translations
- `content/topics.json` — topic structure
- `scripts/generateAudio.ts` — batch TTS generation script
- `scripts/generateVideos.ts` — batch video generation with FFmpeg

### Agent 2: Backend Agent
**Deliverables:**
- `backend/schema.sql` — full Supabase schema
- `backend/api.ts` — all API functions
- `backend/mockData.ts` — offline development data
- `backend/uploadContent.ts` — script to upload all media to Supabase Storage

### Agent 3: Core UI Agent
**Deliverables:**
- Project setup (Expo + all dependencies)
- Navigation structure (two engines, shared nav shell)
- Component library (AudioButton, VideoPlayer, QuestionCard, AnswerOption, etc.)
- Home screen, Topic screen, Sign detail screens
- Both Engine A and Engine B variants of each screen

### Agent 4: Voice Recognition Agent
**Deliverables:**
- `services/speechRecognition.ts` — Google STT integration
- `components/VoiceAnswerButton.tsx` — animated mic button
- Voice answer mapping logic (Amharic numbers → A/B/C)
- Confidence threshold handling and fallback UX
- Testing with Amharic speech samples

### Agent 5: Video & Media Agent
**Deliverables:**
- `components/SignVideoPlayer.tsx` — full-featured video player
- Video caching system (download per topic)
- Audio pre-loading strategy
- Offline mode detection and fallback
- Media pipeline scripts

### Agent 6: QA & Accessibility Agent
**Deliverables:**
- Critical path testing for both engines
- Voice recognition accuracy testing
- Offline functionality testing
- Performance testing (video load times)
- `QA_REPORT.md` + `LAUNCH_CHECKLIST.md`

---

## Success Definition (Strict)

### Group A Success:
A person who cannot read ANY language, using an Android phone for the first time, can:
1. Open app → select Engine A (guided by audio) in under 60 seconds
2. Watch video of a traffic sign and understand its meaning
3. Answer a question about the sign using VOICE in Amharic
4. Receive correct audio feedback with explanation
5. Complete 10 questions with zero text reading required

### Group B Success:
A person who reads Amharic can:
1. Read full explanation of any traffic sign
2. Answer 30-question mock exam by tapping text answers
3. See written + audio feedback for each answer
4. Review results broken down by topic with written analysis

---

## Critical Constraints
- App must work on Android 8+ (older budget phones common in community)
- Total app size without media: < 50MB
- Videos streamable (not all downloaded at once)
- Works on 3G connection minimum
- No Google account required to use the app
- Hebrew (Ministry of Transport official language) never displayed to user — only Amharic
