/**
 * scripts/generateDisclaimerAudio.mjs
 * Generates disclaimer.mp3 using Google Cloud TTS (Amharic am-ET voice)
 * Output: assets/audio/disclaimer.mp3
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY ?? '';
if (!API_KEY) { console.error('❌ Missing EXPO_PUBLIC_GOOGLE_TTS_KEY'); process.exit(1); }

const DISCLAIMER_TEXT = `
የአጠቃቀም ውሎች።

ወደ አማርኛ የንድፈ ሃሳብ ፈተና ዝግጅት አፕሊኬሽን እንኳን ደህና መጡ። ይህን አፕሊኬሽን በመጠቀምዎ የሚከተሉትን ውሎች ይስማሙ።

አንድ፥ የአፕሊኬሽኑ ዓላማ።
ይህ አፕሊኬሽን ተጠቃሚዎች የንድፈ ሃሳብ ፈተናዎችን እንዲዘጋጁ ለመርዳት የተዘጋጀ ነው። ይዘቱ በእስራኤል የትራፊክ ደንቦች እና በቪየና ዓለም አቀፍ ስምምነት ላይ የተመሰረተ ነው። ይህ አፕሊኬሽን በአገርዎ ውስጥ ላለው ኦፊሴላዊ የፍቃድ ባለሥልጣን ቁሳቁስ ምትክ አይደለም።

ሁለት፥ የተጠያቂነት ገደብ።
ገንቢው ይህን አፕሊኬሽን ብቻ ተመርኩዞ ፈተናው ያልተሳካ ከሆነ ተጠያቂ አይሆንም። በእስራኤል የትራፊክ ደንቦች እና በሌሎች አገሮች ደንቦች መካከል ልዩነቶች ሊኖሩ ይችላሉ። አፕሊኬሽኑን መጠቀም ሙሉ በሙሉ የተጠቃሚው ኃላፊነት ነው።

ሶስት፥ ክፍያ እና መሰረዝ።
ክፍያ ለተመረጠው የምዝገባ ጊዜ አስቀድሞ ይፈጸማል። ምዝገባ ከተካሄደ በኋላ ገንዘብ አይመለስም። በአፕሊኬሽኑ በኩል የተረጋገጠ ቴክኒካዊ ብልሽት ከተከሰተ ገንቢው እያንዳንዱን ጉዳይ በተናጠል ይገመግማል።

አራት፥ የፍቃድ አጠቃቀም።
ይህ አፕሊኬሽን ለግል አጠቃቀም ብቻ የታሰበ ነው። ከገንቢው የጽሁፍ ፈቃድ ሳይኖር የአፕሊኬሽኑን ይዘት መቅዳት፣ ማሰራጨት፣ መሸጥ ወይም ማሻሻያ ማድረግ ጥብቅ ክልከላ ነው። ይህን ውል መጣስ ህጋዊ ሂደቶችን ሊያስከትል ይችላል።

አምስት፥ ግላዊነት።
አፕሊኬሽኑ አገልግሎቱን ለማሻሻል ማንነት የለሽ የአጠቃቀም ውሂብ ሊሰበስብ ይችላል። የተጠቃሚ ስምምነት ሳይኖር ግለሰቡን የሚያሳይ ምንም ዓይነት መረጃ አይሰበሰብም። ገንቢው የተጠቃሚ ውሂብ ለሶስተኛ ወገኖች አለመሸጥ ያረጋግጣል።

ስድስት፥ ለውሎቹ ለውጦች።
ገንቢው እነዚህን ውሎች በማንኛውም ጊዜ የማሻሻል መብቱ የተጠበቀ ነው። ዋና ዋና ለውጦች በአፕሊኬሽኑ ውስጥ ይታተማሉ። ለውጦቹ ከታተሙ በኋላ አፕሊኬሽኑን መጠቀሙን መቀጠል አዲሶቹ ውሎችን መቀበልን ያሳያል።

ከተረዱ እና ከተስማሙ፣ ከታች ባለው አረንጓዴ ቁልፍ ላይ ይጫኑ።
`.trim();

function ttsRequest(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      input: { text },
      voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, pitch: 0 },
    });

    const options = {
      hostname: 'texttospeech.googleapis.com',
      path:     `/v1/text:synthesize?key=${API_KEY}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.audioContent) resolve(parsed.audioContent);
          else reject(new Error(parsed.error?.message ?? 'No audioContent'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const OUT = path.join(ROOT, 'assets', 'audio', 'disclaimer.mp3');
if (fs.existsSync(OUT)) {
  fs.unlinkSync(OUT);
  console.log('🗑  Deleted old disclaimer.mp3');
}

console.log('🎙  Generating disclaimer.mp3...');
const audioB64 = await ttsRequest(DISCLAIMER_TEXT);
fs.writeFileSync(OUT, Buffer.from(audioB64, 'base64'));
console.log(`✅  Saved: ${OUT}`);
