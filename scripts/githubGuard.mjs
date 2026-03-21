// Hook guard: blocks git commit/push until user explicitly approves
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const cmd = (input.tool_input && input.tool_input.command) || '';
    if (/git\s+(commit|push)/.test(cmd)) {
      console.log(JSON.stringify({
        continue: false,
        stopReason: '⛔ כלל GitHub — עצור! לפני שמירה ב-GitHub חייב:\n1. לבדוק את האפליקציה\n2. לקבל אישור מפורש ממך\nשאל את המשתמש: "האם בדקת את האפליקציה ואתה מאשר לשמור ב-GitHub?"'
      }));
    }
  } catch (e) {}
});
