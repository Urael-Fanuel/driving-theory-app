# Setup Guide — ሹፌርነት ትምህርት

## Step 1: Install Node.js

Download and install Node.js from: https://nodejs.org (LTS version recommended)

After installation, verify in a new terminal:
```
node --version   # Should show v18+ or v20+
npm --version    # Should show 9+
```

## Step 2: Install Expo CLI

```bash
npm install -g expo-cli eas-cli
```

## Step 3: Install project dependencies

Open terminal in this folder (`driving-theory-app`) and run:

```bash
npm install
```

Then install Expo-specific packages:

```bash
npx expo install expo-av expo-haptics expo-file-system expo-speech
npx expo install expo-router expo-status-bar
npx expo install react-native-gesture-handler react-native-reanimated
npx expo install react-native-safe-area-context react-native-screens
npx expo install react-native-video
```

## Step 4: Start the development server

```bash
npx expo start
```

This opens Expo DevTools. Then:
- Press `a` to open on Android emulator
- Scan QR code with **Expo Go** app on your phone

## Step 5: Run on a real device (recommended)

1. Install **Expo Go** from Google Play Store
2. Scan the QR code shown in terminal
3. The app will load — it works in mock mode without any backend!

## Development Without Backend

The app runs in "mock mode" when no Supabase URL is configured.
All 60 signs and 180 questions are loaded from `content/signs.json`.

No `.env` file needed for development!

## Production Setup

See `README.md` for full production setup with Supabase + Google Cloud.
