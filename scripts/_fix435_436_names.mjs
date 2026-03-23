import { readFileSync, writeFileSync } from 'fs';

const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

async function ask(prompt) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }),
  });
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return (parts.find(p => p.text && !p.thought)?.text ?? parts[0]?.text ?? '').trim();
}

async function translate(hebrewName, hebrewMeaning) {
  const name_amharic = await ask(
    `Translate this Israeli traffic sign name to Amharic. Reply with ONLY the Amharic translation, max 5 words, nothing else.\nSign: "${hebrewName}"`
  );
  const explanation_amharic = await ask(
    `Write a 2-sentence explanation in Amharic for this Israeli traffic sign.\nSign meaning: "${hebrewMeaning}"\nReply in Amharic only, no Hebrew, no English.`
  );
  return { name_amharic, explanation_amharic };
}

const signs = JSON.parse(readFileSync('./content/signs.json', 'utf8'));

const t435 = await translate(
  'אזור אסור לחניית רכב שמשקלו הכולל המותר עולה על 10,000 קילוגרם',
  'בשטח זה אסור לחנות רכב שמשקלו הכולל המותר עולה על 10,000 ק"ג. רכבים קלים יכולים לחנות.'
);
const t436 = await translate(
  'קצה האזור האסור לחניית רכב מסחרי שמשקלו הכולל המותר עולה על 10,000 קילוגרם',
  'תמרור זה מסמן את סוף האיסור. מנקודה זו חנייה מותרת שוב לרכבים מעל 10,000 ק"ג, אלא אם ישנם תמרורים אחרים.'
);

const s435 = signs.find(x => x.image_filename === '435.png');
const s436 = signs.find(x => x.image_filename === '436.png');
s435.name_amharic = t435.name_amharic;
s435.explanation_amharic = t435.explanation_amharic;
s436.name_amharic = t436.name_amharic;
s436.explanation_amharic = t436.explanation_amharic;

writeFileSync('./content/signs.json', JSON.stringify(signs, null, 2));
console.log('435 name:', t435.name_amharic);
console.log('435 exp:', t435.explanation_amharic);
console.log('436 name:', t436.name_amharic);
console.log('436 exp:', t436.explanation_amharic);
console.log('✅ signs.json updated');
