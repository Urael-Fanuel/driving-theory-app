// Hook: reminds Claude of the NO ASSUMPTIONS RULE before every user prompt
const reminder = {
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext:
      "⚠️ NO ASSUMPTIONS RULE (MANDATORY):\n" +
      "1. לפני כל פעולה — שאל את עצמך: האם אני בטוח 100% שזה מה שהמשתמש רצה? אם יש ספק — עצור ושאל.\n" +
      "2. לפני שאתה נותן הוראות בדיקה/עיון למשתמש — ודא שכללת את כל הפריטים שעבדת עליהם, לא רק חלקם. שאל את עצמך: 'האם יש פריטים שעבדתי עליהם ולא הזכרתי?'\n" +
      "3. אסור להחליט לבד שפריט מסוים 'פחות חשוב' — זו הנחה. אם עבדת על X פריטים, ציין את כולם."
  }
};
process.stdout.write(JSON.stringify(reminder));
