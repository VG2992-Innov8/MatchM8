// tools/fix-curly.js
const fs = require('fs');
const path = require('path');

function* walk(dir) {
  for (const de of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, de.name);
    if (de.isDirectory()) {
      if (de.name === 'node_modules' || de.name === '.git') continue;
      yield* walk(p);
    } else if (p.endsWith('.js')) {
      yield p;
    }
  }
}

let changed = 0;
for (const file of walk(process.cwd())) {
  let s = fs.readFileSync(file, 'utf8');
  const before = s;

  // Smart quotes → straight
  s = s.replace(/[\u201C\u201D]/g, '"'); // " "
  s = s.replace(/[\u2018\u2019]/g, "'"); // ' '

  // Full-width / prime marks sometimes pasted as quotes
  s = s.replace(/\uFF02/g, '"'); // "
  s = s.replace(/\u2032/g, "'"); // '
  s = s.replace(/\u2033/g, '"'); // "

  // Invisibles that break parsing
  s = s.replace(/\u00A0/g, ' ');           // NBSP
  s = s.replace(/[\u200B\u200C\u200D]/g, ''); // ZWSP, ZWNJ, ZWJ
  s = s.replace(/\u2060/g, '');            // word joiner

  if (s !== before) {
    fs.writeFileSync(file, s, 'utf8');
    changed++;
    console.log('[fix]', file);
  }
}
console.log(`Done. Files changed: ${changed}`);
