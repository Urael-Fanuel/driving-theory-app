# Claude Code — Multi-Agent Prompt v2.0
# Ethiopian Driving Theory App: Video + Voice + Text Engines

## Critical Context
This app serves TWO completely separate user groups with different learning engines.
Read this before writing a single line of code.

**Engine A (Non-readers):**
- Learn via: Short VIDEO per sign + AUDIO narration
- Answer questions: VOICE input (say "አንድ/ሁለት/ሶስት" = 1/2/3)
- Feedback: AUDIO only ("ትክክል ነው" / "ስህተት ነው" + audio explanation)
- ZERO text displayed to this user

**Engine B (Amharic readers):**
- Learn via: Sign IMAGE + full written AMHARIC text explanation
- Answer questions: TAP written answer choices
- Feedback: WRITTEN text + optional audio button
- Also has access to video (optional)

These are not "modes" — they are fundamentally different UX flows built on the same data layer.

---

## ORCHESTRATOR: Run these 6 agents in sequence

---

## AGENT 1: CONTENT AGENT

### Task
Prepare the complete content database.

### Step 1: Create `content/signs.json`
```json
[
  {
    "id": "SIGN_STOP",
    "topic_id": "regulatory",
    "order": 1,
    "image_filename": "sign_stop.png",
    "video_filename": "sign_stop_amharic.mp4",
    "name_hebrew": "עצור",
    "name_amharic": "ቁም",
    "explanation_amharic": "ይህ ምልክት ሙሉ ለሙሉ ማቆምን ያዝዛል። ተሽከርካሪው ሙሉ ለሙሉ እስኪቆም ድረስ መቀጠል አይፈቀድም። ከቆምን በኋላ መንገዱ ሲጸዳ ብቻ መቀጠል ይቻላል።",
    "audio_name_filename": "sign_stop_name.mp3",
    "audio_explanation_filename": "sign_stop_explanation.mp3",
    "questions": [
      {
        "id": "Q_STOP_001",
        "question_amharic": "ቁም ምልክት ሲያዩ ምን ማድረግ አለብዎ?",
        "question_audio": "q_stop_001.mp3",
        "answers": [
          { "id": "A", "text_amharic": "ሙሉ ለሙሉ ማቆም", "image": "answer_full_stop.png", "is_correct": true },
          { "id": "B", "text_amharic": "ፍጥነት ቀነስ", "image": "answer_slow_down.png", "is_correct": false },
          { "id": "C", "text_amharic": "ቀጥ ሂድ", "image": "answer_continue.png", "is_correct": false }
        ],
        "explanation_correct_amharic": "ትክክል! ቁም ምልክት ሙሉ ለሙሉ ማቆምን ያዝዛል።",
        "explanation_wrong_amharic": "ትክክል አይደለም። ቁም ምልክት ሲያዩ ሙሉ ለሙሉ ማቆም አለብዎ።",
        "explanation_correct_audio": "q_stop_001_correct.mp3",
        "explanation_wrong_audio": "q_stop_001_wrong.mp3"
      }
    ]
  }
]
```

Create **60 signs** across 6 topics:
- `regulatory` — תמרורי חובה (Stop, Yield, No entry, Speed limits)
- `warning` — תמרורי אזהרה (Curves, pedestrian crossing, school zone)
- `information` — תמרורי מידע (Directions, parking, services)
- `road_markings` — סימוני כביש (Lines, arrows, crosswalks)
- `right_of_way` — זכות קדימה (Junctions, roundabouts)
- `safety` — בטיחות (Seatbelt, alcohol, night driving)

### Step 2: Create `content/topics.json`
```json
[
  {
    "id": "regulatory",
    "name_amharic": "አስገዳጅ ምልክቶች",
    "name_hebrew": "תמרורי חובה",
    "icon": "🔴",
    "color": "#C62828",
    "description_amharic": "እነዚህ ምልክቶች ህጋዊ ግዴታ ናቸው። መጣስ ቅጣት ያስከትላል።",
    "audio_intro": "topic_regulatory_intro.mp3",
    "sign_count": 15
  }
]
```

### Step 3: Create `scripts/generateAllAudio.ts`
This script generates ALL audio files using Google Cloud TTS.

```typescript
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs';
import * as path from 'path';
import signs from '../content/signs.json';

const client = new TextToSpeechClient();

async function generateAudio(text: string, filename: string): Promise<void> {
  const outputPath = path.join('assets/audio', filename);
  if (fs.existsSync(outputPath)) return; // Skip if already exists
  
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'am-ET',
      name: 'am-ET-Standard-A',
      ssmlGender: 'FEMALE'
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.9, // Slightly slower for clarity
      pitch: 0.0
    }
  });
  
  fs.writeFileSync(outputPath, response.audioContent as Buffer);
  console.log(`✅ Generated: ${filename}`);
}

async function generateAll() {
  fs.mkdirSync('assets/audio', { recursive: true });
  
  for (const sign of signs) {
    await generateAudio(sign.name_amharic, sign.audio_name_filename);
    await generateAudio(sign.explanation_amharic, sign.audio_explanation_filename);
    
    for (const q of sign.questions) {
      await generateAudio(q.question_amharic, q.question_audio);
      await generateAudio(q.explanation_correct_amharic, q.explanation_correct_audio);
      await generateAudio(q.explanation_wrong_amharic, q.explanation_wrong_audio);
      
      for (const a of q.answers) {
        await generateAudio(a.text_amharic, `answer_${q.id}_${a.id}.mp3`);
      }
    }
  }
  console.log('🎉 All audio generated!');
}

generateAll().catch(console.error);
```

### Step 4: Create `scripts/generateVideos.ts`
Generate sign videos using FFmpeg (Ken Burns effect on sign image + audio narration).

```typescript
import { execSync } from 'child_process';
import * as fs from 'fs';
import signs from '../content/signs.json';

// Requires: ffmpeg installed, sign images in assets/images/, audio in assets/audio/
function generateSignVideo(signId: string, imageFile: string, audioFile: string, outputFile: string) {
  const imagePath = `assets/images/${imageFile}`;
  const audioPath = `assets/audio/${audioFile}`;
  const outputPath = `assets/videos/${outputFile}`;
  
  if (fs.existsSync(outputPath)) return;
  
  // Ken Burns zoom-in effect + audio duration detection
  const cmd = `ffmpeg -loop 1 -i "${imagePath}" -i "${audioPath}" \
    -filter_complex "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,\
    pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#1a1a2e,\
    zoompan=z='min(zoom+0.0008,1.3)':d=250:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720,\
    format=yuv420p[v]" \
    -map "[v]" -map 1:a \
    -c:v libx264 -preset medium -crf 23 \
    -c:a aac -b:a 128k \
    -shortest "${outputPath}"`;
  
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`✅ Video: ${outputFile}`);
  } catch (e) {
    console.error(`❌ Failed: ${signId}`, e);
  }
}

async function generateAll() {
  fs.mkdirSync('assets/videos', { recursive: true });
  
  for (const sign of signs) {
    generateSignVideo(
      sign.id,
      sign.image_filename,
      sign.audio_explanation_filename,
      sign.video_filename
    );
  }
}

generateAll();
```

### Output
- `content/signs.json` (60 signs, 3 questions each = 180 questions)
- `content/topics.json` (6 topics)
- `scripts/generateAllAudio.ts`
- `scripts/generateVideos.ts`

---

## AGENT 2: BACKEND AGENT

### Task
Build the complete Supabase backend.

### Step 1: `backend/schema.sql`
```sql
-- Topics
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name_amharic TEXT NOT NULL,
  name_hebrew TEXT,
  icon TEXT,
  color TEXT,
  description_amharic TEXT,
  audio_intro_url TEXT,
  sign_count INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0
);

-- Signs (Traffic signs/icons)
CREATE TABLE signs (
  id TEXT PRIMARY KEY,
  topic_id TEXT REFERENCES topics(id),
  display_order INTEGER DEFAULT 0,
  name_amharic TEXT NOT NULL,
  name_hebrew TEXT,
  explanation_amharic TEXT NOT NULL,
  image_url TEXT,
  video_url TEXT,
  audio_name_url TEXT,
  audio_explanation_url TEXT,
  difficulty INTEGER DEFAULT 1
);

-- Questions (linked to signs)
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  sign_id TEXT REFERENCES signs(id),
  topic_id TEXT REFERENCES topics(id),
  question_amharic TEXT NOT NULL,
  question_audio_url TEXT,
  answers JSONB NOT NULL,
  -- answers format: [{ id, text_amharic, image_url, audio_url, is_correct }]
  explanation_correct_amharic TEXT NOT NULL,
  explanation_wrong_amharic TEXT NOT NULL,
  explanation_correct_audio_url TEXT,
  explanation_wrong_audio_url TEXT,
  difficulty INTEGER DEFAULT 1
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE,
  display_name TEXT,
  engine_type TEXT DEFAULT 'A' CHECK (engine_type IN ('A', 'B')),
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW()
);

-- User progress per question
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES questions(id),
  correct_count INTEGER DEFAULT 0,
  attempt_count INTEGER DEFAULT 0,
  last_attempted TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- Signs viewed (for Group A — track video watches)
CREATE TABLE sign_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  sign_id TEXT REFERENCES signs(id),
  view_count INTEGER DEFAULT 1,
  video_completed BOOLEAN DEFAULT false,
  last_viewed TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, sign_id)
);

-- Exam sessions
CREATE TABLE exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  engine_type TEXT,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  duration_seconds INTEGER,
  topic_breakdown JSONB,
  -- { topic_id: { correct: n, total: n } }
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE signs ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;

-- Public read for content
CREATE POLICY "public_read_signs" ON signs FOR SELECT USING (true);
CREATE POLICY "public_read_questions" ON questions FOR SELECT USING (true);
CREATE POLICY "public_read_topics" ON topics FOR SELECT USING (true);

-- Users own their data
CREATE POLICY "own_progress" ON user_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_views" ON sign_views FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_exams" ON exam_sessions FOR ALL USING (auth.uid() = user_id);
```

### Step 2: `backend/api.ts`
```typescript
import { supabase } from './supabaseClient';
import mockData from './mockData';

const USE_MOCK = !process.env.EXPO_PUBLIC_SUPABASE_URL;

// Signs
export async function getTopics() {
  if (USE_MOCK) return mockData.topics;
  const { data } = await supabase.from('topics').select('*').order('display_order');
  return data;
}

export async function getSignsByTopic(topicId: string) {
  if (USE_MOCK) return mockData.signs.filter(s => s.topic_id === topicId);
  const { data } = await supabase
    .from('signs')
    .select('*')
    .eq('topic_id', topicId)
    .order('display_order');
  return data;
}

export async function getSignWithQuestions(signId: string) {
  if (USE_MOCK) {
    const sign = mockData.signs.find(s => s.id === signId);
    const questions = mockData.questions.filter(q => q.sign_id === signId);
    return { ...sign, questions };
  }
  const { data: sign } = await supabase.from('signs').select('*').eq('id', signId).single();
  const { data: questions } = await supabase.from('questions').select('*').eq('sign_id', signId);
  return { ...sign, questions };
}

// Exam
export async function getRandomExamQuestions(count: number = 30) {
  if (USE_MOCK) {
    return mockData.questions.sort(() => Math.random() - 0.5).slice(0, count);
  }
  const { data } = await supabase.rpc('get_random_questions', { count });
  return data;
}

// Progress
export async function saveAnswer(userId: string, questionId: string, isCorrect: boolean) {
  if (USE_MOCK) return;
  await supabase.from('user_progress').upsert({
    user_id: userId,
    question_id: questionId,
    correct_count: isCorrect ? 1 : 0,
    attempt_count: 1,
    last_attempted: new Date().toISOString()
  }, {
    onConflict: 'user_id,question_id',
    ignoreDuplicates: false
  });
}

export async function saveExamSession(userId: string, score: number, total: number, passed: boolean, duration: number, breakdown: object) {
  if (USE_MOCK) return { id: 'mock-session' };
  const { data } = await supabase.from('exam_sessions').insert({
    user_id: userId,
    score, total_questions: total, passed, duration_seconds: duration, topic_breakdown: breakdown
  }).select().single();
  return data;
}
```

### Output
- `backend/schema.sql`
- `backend/supabaseClient.ts`
- `backend/api.ts`
- `backend/mockData.ts` (seeded with content from Agent 1)
- `backend/uploadContent.ts` (script to upload JSON + media to Supabase)

---

## AGENT 3: UI AGENT

### Task
Build the complete React Native (Expo) app with both Engine A and Engine B.

### Project Setup
```bash
npx create-expo-app DrivingTheoryApp --template blank-typescript
cd DrivingTheoryApp

# Core dependencies
npx expo install expo-av expo-haptics expo-file-system expo-speech
npx expo install react-native-video
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-reanimated react-native-gesture-handler react-native-safe-area-context react-native-screens

# Supabase
npm install @supabase/supabase-js

# Dev tools
npm install --save-dev @types/react-native
```

### Complete File Structure
```
DrivingTheoryApp/
├── app/
│   ├── _layout.tsx              # Root navigator + engine provider
│   ├── index.tsx                # Engine selection screen (onboarding)
│   ├── (engineA)/
│   │   ├── _layout.tsx          # Engine A bottom tabs
│   │   ├── home.tsx             # Topic grid (icons + audio)
│   │   ├── topic/[id].tsx       # Sign grid for topic (images only)
│   │   ├── sign/[id].tsx        # Video player screen
│   │   ├── question/[id].tsx    # Voice answer question screen
│   │   ├── exam.tsx             # Exam mode (voice answers)
│   │   └── progress.tsx         # Visual progress (no text)
│   ├── (engineB)/
│   │   ├── _layout.tsx          # Engine B bottom tabs
│   │   ├── home.tsx             # Topic list (text + icons)
│   │   ├── topic/[id].tsx       # Sign list with text
│   │   ├── sign/[id].tsx        # Sign detail (text explanation)
│   │   ├── question/[id].tsx    # Text answer question screen
│   │   ├── exam.tsx             # Exam mode (text answers)
│   │   └── progress.tsx         # Detailed text progress
│   └── result/[sessionId].tsx   # Shared exam result screen
│
├── components/
│   ├── shared/
│   │   ├── AudioButton.tsx      # Large speaker button (always visible)
│   │   ├── TopicCard.tsx        # Topic selection card
│   │   ├── ProgressBar.tsx      # Visual progress bar
│   │   └── LoadingScreen.tsx    # Loading with audio "እየጫነ ነው..."
│   ├── engineA/
│   │   ├── SignVideoPlayer.tsx  # Full-screen video player
│   │   ├── VoiceAnswerButton.tsx # Animated microphone button
│   │   ├── ImageAnswerCard.tsx  # Answer choice (image only)
│   │   └── AudioFeedback.tsx    # Correct/wrong audio + animation
│   └── engineB/
│       ├── SignTextDetail.tsx   # Text explanation with image
│       ├── TextAnswerCard.tsx   # Written answer choice
│       └── TextFeedback.tsx     # Written + audio feedback
│
├── hooks/
│   ├── useAudio.ts              # Audio playback
│   ├── useVoiceRecognition.ts   # STT integration
│   ├── useVideoPlayer.ts        # Video state management
│   ├── useProgress.ts           # Progress tracking
│   └── useExam.ts               # Exam state machine
│
├── services/
│   ├── speechRecognition.ts     # Google STT API
│   └── audioCache.ts            # Local audio caching
│
├── contexts/
│   └── EngineContext.tsx        # Global engine type (A|B) + user state
│
└── constants/
    ├── colors.ts
    └── typography.ts
```

### Critical Component: Engine Selection Screen (app/index.tsx)
```typescript
import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAudio } from '../hooks/useAudio';
import * as Haptics from 'expo-haptics';

export default function EngineSelection() {
  const router = useRouter();
  const { playAudio } = useAudio();
  
  useEffect(() => {
    // Auto-play welcome + instruction audio on mount
    playAudio('assets/audio/welcome_select_mode.mp3');
    // Audio says: "እንኳን ደህና መጡ! እባክዎ የሚፈልጉትን አጠናቀቅ ምርጫ ይምረጡ"
  }, []);

  const selectEngine = async (engine: 'A' | 'B') => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (engine === 'A') {
      playAudio('assets/audio/selected_mode_a.mp3'); // "ምስልና ድምጽ ምርጫ ተመርጧል"
      router.replace('/(engineA)/home');
    } else {
      playAudio('assets/audio/selected_mode_b.mp3'); // "ፅሁፍ ምርጫ ተመርጧል"
      router.replace('/(engineB)/home');
    }
  };

  return (
    <View style={styles.container}>
      {/* Engine A Card — NON-READER */}
      <TouchableOpacity 
        style={styles.engineCard}
        onPress={() => selectEngine('A')}
        accessibilityLabel="ድምጽ ብቻ ማጥናት"
      >
        <Image source={require('../assets/icons/ear_icon.png')} style={styles.engineIcon} />
        {/* Tap to hear what this mode does */}
        <TouchableOpacity onPress={() => playAudio('assets/audio/explain_mode_a.mp3')}>
          <Image source={require('../assets/icons/speaker.png')} style={styles.speakerSmall} />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Engine B Card — AMHARIC READER */}
      <TouchableOpacity 
        style={styles.engineCard}
        onPress={() => selectEngine('B')}
        accessibilityLabel="ፅሁፍና ድምጽ ማጥናት"
      >
        <Image source={require('../assets/icons/book_icon.png')} style={styles.engineIcon} />
        <Text style={styles.engineLabel}>ፅሁፍ</Text>
        <TouchableOpacity onPress={() => playAudio('assets/audio/explain_mode_b.mp3')}>
          <Image source={require('../assets/icons/speaker.png')} style={styles.speakerSmall} />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', gap: 32 },
  engineCard: { 
    width: '80%', height: 200, backgroundColor: '#2E7D32',
    borderRadius: 24, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 12
  },
  engineIcon: { width: 100, height: 100, resizeMode: 'contain' },
  engineLabel: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginTop: 8 },
  speakerSmall: { width: 36, height: 36, marginTop: 12 }
});
```

### Critical Component: Sign Video Player (Engine A)
```typescript
// components/engineA/SignVideoPlayer.tsx
// Props: sign (with video_url, audio_explanation_url, name_amharic, questions)
// 
// Layout:
// ┌─────────────────────┐
// │   [← Back]          │
// │                     │
// │   VIDEO PLAYER      │  ← Full width, 280px height
// │   (16:9 ratio)      │
// │                     │
// ├─────────────────────┤
// │  [🔊 Play Again]   │  ← Large audio replay button
// ├─────────────────────┤
// │  [Start Quiz →]     │  ← Large green button, audio label
// └─────────────────────┘
//
// Behavior:
// - Video auto-plays on mount (no tap needed)
// - Shows play/pause overlay on tap
// - After video ends: "Start Quiz" button pulses
// - Back button: plays audio "ተመለስ" (go back)
```

### Critical Component: Voice Answer Question Screen (Engine A)
```typescript
// app/(engineA)/question/[id].tsx
//
// Layout:
// ┌─────────────────────┐
// │ Sign Image (200px)  │
// │                     │
// │ ❓ [🔊 Question    ] │  ← Auto-plays on load
// │    plays as audio   │
// ├─────────────────────┤
// │  [IMG] [IMG] [IMG]  │  ← 3 answer images (tap OR voice)
// │   (1)   (2)   (3)  │  ← Number shown below each
// ├─────────────────────┤
// │   🎤 SPEAK          │  ← Large mic button (80x80)
// │  "አንድ/ሁለት/ሶስት"   │  ← Text shows only "1  2  3" (digits)
// └─────────────────────┘
//
// After answer selected:
// ┌─────────────────────┐
// │ ✅ or ❌ (full      │
// │    screen overlay)  │
// │                     │
// │ Audio plays reason  │
// │                     │
// │ [Next →]            │
// └─────────────────────┘
```

### Color Constants (constants/colors.ts)
```typescript
export const Colors = {
  // Ethiopian flag colors
  primary: '#2E7D32',      // Green
  secondary: '#FDD835',    // Yellow
  accent: '#C62828',       // Red
  
  // App UI
  background: '#1a1a2e',   // Dark navy (easy on eyes)
  surface: '#16213e',      // Slightly lighter
  card: '#0f3460',         // Card background
  
  // Feedback
  correct: '#43A047',
  correctLight: '#C8E6C9',
  wrong: '#E53935',
  wrongLight: '#FFCDD2',
  
  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#B0BEC5',
  
  // Mic button states
  micIdle: '#1565C0',
  micListening: '#E53935',   // Red when recording
  micProcessing: '#FDD835',  // Yellow when processing
}
```

### Typography (constants/typography.ts)
```typescript
// Amharic script requires larger base size than Latin
export const Typography = {
  signName: { fontSize: 28, fontWeight: '700' as const },
  question: { fontSize: 22, fontWeight: '600' as const, lineHeight: 36 },
  answer: { fontSize: 20, fontWeight: '500' as const, lineHeight: 32 },
  body: { fontSize: 18, lineHeight: 30 },
  caption: { fontSize: 16 },
  number: { fontSize: 32, fontWeight: '900' as const }, // Answer numbers (1, 2, 3)
}
```

---

## AGENT 4: VOICE RECOGNITION AGENT

### Task
Build the complete voice answer system for Engine A.

### Step 1: `services/speechRecognition.ts`
```typescript
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

const GOOGLE_STT_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_STT_KEY;

// These are the ONLY words we need to recognize
// This dramatically improves accuracy
const PHRASE_HINTS = ['አንድ', 'ሁለት', 'ሶስት', 'ሀ', 'ለ', 'ሐ', '1', '2', '3'];

// Maps recognized text → answer index (0, 1, 2)
function mapSpeechToAnswer(transcript: string): number | null {
  const t = transcript.trim();
  if (['አንድ', 'ሀ', '1', 'one'].includes(t)) return 0;
  if (['ሁለት', 'ለ', '2', 'two'].includes(t)) return 1;
  if (['ሶስት', 'ሐ', '3', 'three'].includes(t)) return 2;
  return null; // Not recognized
}

interface STTResult {
  answer: number | null; // 0, 1, or 2 — null means not recognized
  confidence: number;    // 0-1
  transcript: string;
}

export async function recognizeAmharicAnswer(audioUri: string): Promise<STTResult> {
  const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
    encoding: FileSystem.EncodingType.Base64
  });

  const response = await fetch(`${GOOGLE_STT_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'am-ET',
        speechContexts: [{ phrases: PHRASE_HINTS, boost: 20 }],
        maxAlternatives: 1,
        model: 'default'
      },
      audio: { content: base64Audio }
    })
  });

  const data = await response.json();
  
  if (!data.results || data.results.length === 0) {
    return { answer: null, confidence: 0, transcript: '' };
  }
  
  const result = data.results[0].alternatives[0];
  const transcript = result.transcript?.trim() || '';
  const confidence = result.confidence || 0;
  
  // Only accept if confidence > 0.7
  if (confidence < 0.7) {
    return { answer: null, confidence, transcript };
  }
  
  return {
    answer: mapSpeechToAnswer(transcript),
    confidence,
    transcript
  };
}
```

### Step 2: `hooks/useVoiceRecognition.ts`
```typescript
import { useState, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { recognizeAmharicAnswer } from '../services/speechRecognition';

type RecognitionState = 'idle' | 'listening' | 'processing' | 'done' | 'failed';

export function useVoiceRecognition(onAnswer: (answerIndex: number | null) => void) {
  const [state, setState] = useState<RecognitionState>('idle');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startListening = useCallback(async () => {
    try {
      setState('listening');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      
      // Auto-stop after 5 seconds
      timeoutRef.current = setTimeout(() => stopListening(), 5000);
      
    } catch (e) {
      console.error('Recording failed:', e);
      setState('failed');
      onAnswer(null);
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!recordingRef.current) return;
    
    setState('processing');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      
      if (!uri) throw new Error('No recording URI');
      
      const result = await recognizeAmharicAnswer(uri);
      setState('done');
      onAnswer(result.answer);
      
    } catch (e) {
      setState('failed');
      onAnswer(null); // Fallback: user must tap
    } finally {
      recordingRef.current = null;
    }
  }, [onAnswer]);

  return { state, startListening, stopListening };
}
```

### Step 3: `components/engineA/VoiceAnswerButton.tsx`
```typescript
// Large mic button with states:
// IDLE: Blue circle, mic icon, pulsing subtly
// LISTENING: Red circle, mic icon, large pulse animation, shows "ይናገሩ..." (speak...)
// PROCESSING: Yellow circle, spinner
// FAILED: Gray, shows tap-to-retry icon
//
// Size: 100x100 minimum
// Always accompanied by number tap-targets as fallback
// If state=failed: play audio "ዳግም ሞክር" (try again)
```

### Critical UX Rule for Voice Failures
If STT returns null (not recognized) OR confidence < 70%:
1. Play audio: "ያልተሰማ። ቁጥሩን ይጫኑ" ("Not heard. Press the number")
2. Highlight the 3 numbered answer images with a bounce animation
3. User taps image to answer
4. NEVER leave user stuck — tap always works

---

## AGENT 5: VIDEO & MEDIA AGENT

### Task
Build the video player component and media management system.

### Step 1: `components/engineA/SignVideoPlayer.tsx`
```typescript
import React, { useRef, useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import * as Haptics from 'expo-haptics';

interface SignVideoPlayerProps {
  videoUrl: string;
  onVideoEnd: () => void;
  thumbnailUrl?: string;
}

export function SignVideoPlayer({ videoUrl, onVideoEnd, thumbnailUrl }: SignVideoPlayerProps) {
  const videoRef = useRef<VideoRef>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  const handleEnd = () => {
    setHasEnded(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onVideoEnd();
  };

  const handleReplay = () => {
    videoRef.current?.seek(0);
    setIsPaused(false);
    setHasEnded(false);
  };

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={styles.video}
        resizeMode="contain"
        paused={isPaused}
        onLoad={() => setIsLoading(false)}
        onEnd={handleEnd}
        poster={thumbnailUrl}
        posterResizeMode="cover"
      />
      
      {isLoading && <ActivityIndicator style={styles.loader} size="large" color="#FDD835" />}
      
      {/* Tap anywhere to pause/play */}
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setIsPaused(!isPaused)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: 280, backgroundColor: '#000', borderRadius: 16, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  loader: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -20 }, { translateY: -20 }] }
});
```

### Step 2: `services/audioCache.ts`
```typescript
// Pre-download audio for offline use
// Priority order:
// 1. Sign names for all 60 signs (small files, download on first launch)
// 2. Topic intros (6 files)
// 3. Individual sign explanations (download per topic when user opens topic)
// 4. Question audio (download per sign when user opens sign)
//
// Storage: expo-file-system in documentDirectory/audio/
// Check: if file exists locally → use local, else stream from Supabase
```

### Step 3: `hooks/useVideoPlayer.ts`
```typescript
// Manages:
// - Video playback state
// - Progress tracking (did user watch > 80%? Mark as "viewed")
// - Auto-advance to quiz after video ends
// - Download management (download video locally for offline)
```

---

## AGENT 6: QA AGENT

### Critical Test Paths

**ENGINE A — FULL NON-READER FLOW:**
```
1. Open app → Welcome audio plays within 2 seconds ✓
2. Tap Engine A card → audio confirms selection ✓
3. Home screen loads → topic audio plays ✓
4. Tap topic → sign grid with images only loads ✓
5. Tap sign → VIDEO auto-plays within 3 seconds ✓
6. Video completes → "Start Quiz" button pulses ✓
7. Tap Start Quiz → question audio auto-plays ✓
8. 3 answer images visible with numbers 1/2/3 ✓
9. Tap mic button → state goes IDLE → LISTENING (red) ✓
10. Say "አንድ" → state goes PROCESSING → DONE ✓
11. Answer selected → visual highlight on chosen answer ✓
12. Correct/wrong audio plays with explanation ✓
13. Next question loads and audio plays ✓
14. ZERO text required at any step ✓

FAILURE MODE TEST:
9b. Speak gibberish → state goes FAILED ✓
10b. Audio plays "ቁጥሩን ይጫኑ" → tap targets highlighted ✓
11b. Tap answer works normally ✓
```

**ENGINE B — FULL READER FLOW:**
```
1. Select Engine B → home with text labels ✓
2. Tap topic → list with sign image + Amharic name ✓
3. Tap sign → image + full Amharic explanation text ✓
4. Explanation text renders correctly (Ethiopic script, no boxes) ✓
5. Optional audio button plays explanation ✓
6. Tap "Practice" → question in Amharic text ✓
7. 3 written answer choices in Amharic ✓
8. Tap answer → written + audio feedback ✓
```

**OFFLINE TEST:**
```
1. Enable airplane mode ✓
2. Open app → loads from cache ✓
3. Previously visited topic signs load ✓
4. Video plays from local cache ✓
5. Audio plays from local cache ✓
6. Clear graceful error if content not cached: audio plays "ኔት ወርክ አስፈልጋል" ✓
```

**PERFORMANCE REQUIREMENTS:**
- App cold start: < 3 seconds
- Video start playing: < 3 seconds (streaming)
- Audio response time: < 1 second
- STT round trip: < 4 seconds
- No frame drops during video + audio simultaneous playback

**UI AUDIT:**
- [ ] All tap targets ≥ 60x60px — measure with React Native debug overlay
- [ ] All Amharic text uses correct Unicode (Ethiopic block U+1200–U+137F)
- [ ] Video player works on Android API 26+
- [ ] Microphone permission handled gracefully if denied
- [ ] Back navigation always works (no dead ends)
- [ ] App doesn't crash if audio file missing (silent fallback)

### Output
- `QA_REPORT.md` with pass/fail for all above
- `BUGS.md` with fixed issues
- `PERFORMANCE_REPORT.md`
- `LAUNCH_CHECKLIST.md`

---

## Environment Variables
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_GOOGLE_STT_KEY=your-google-stt-api-key
EXPO_PUBLIC_GOOGLE_TTS_KEY=your-google-tts-api-key
```

## Final Notes for Claude Code
- Amharic is written LEFT TO RIGHT (not RTL like Hebrew or Arabic)
- Use `fontFamily: 'NotoSansEthiopic'` if available, else system handles Ethiopic script natively on Android 5+
- The app name displayed: "ሹፌርነት ትምህርት" 
- Engine A users may have NEVER used a smartphone — assume zero digital literacy
- Test on low-end Android (Snapdragon 450 equivalent) — many in community use budget phones
- NEVER show Hebrew to the user — all UI is Amharic only
