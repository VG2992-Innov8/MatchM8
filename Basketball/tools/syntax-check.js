// tools/syntax-check.js
// Usage: node tools/syntax-check.js [root=.]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || '.');

function* walk(dir) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

function existsMaybe(p) {
  // check p, p.js, p/index.js
  if (fs.existsSync(p)) return p;
  if (fs.existsSync(p + '.js')) return p + '.js';
  if (fs.existsSync(path.join(p, 'index.js'))) return path.join(p, 'index.js');
  return null;
}

let bad = 0;
function logErr(file, msg) {
  bad++;
  console.error(`[ERR] ${file}\n      ${msg}`);
}

(async () => {
  // 1) JS syntax compile (does not execute)
  for (const file of walk(root)) {
    if (!file.endsWith('.js')) continue;
    try {
      const code = fs.readFileSync(file, 'utf8');

      // Skip ESM modules and client/public assets to reduce noise
      if (/^\s*(import\s|export\s)/m.test(code)) continue;
      if (file.includes(path.sep + 'public' + path.sep)) continue;

      const isSelf = file.endsWith(path.join('tools', 'syntax-check.js'));

      // Compile (syntax check only)
      new vm.Script(code, { filename: file, displayErrors: true });

      // Odd number of backticks — skip for our own file
      if (!isSelf) {
        const ticks = (code.match(/`/g) || []).length;
        if (ticks % 2 === 1) {
          logErr(file, 'Odd number of backticks (possible unclosed template literal).');
        }
      }

      // Curly quotes / invisibles -> warn only (they're mostly harmless now)
      const weirdChars = /[\u2018\u2019\u201C\u201D\uFF02\u2032\u2033\u00A0\u200B\u200C\u200D\u2060]/;
      if (weirdChars.test(code)) {
        console.warn(`[WARN] ${file} contains fancy quotes or invisibles.`);
      }

      // 2) relative require sanity
      const re = /require\((['"])(\.[^'"]+)\1\)/g;
      let m;
      while ((m = re.exec(code))) {
        const rel = m[2];
        const target = path.resolve(path.dirname(file), rel);
        if (!existsMaybe(target)) {
          logErr(file, `Broken relative require(): ${rel}`);
        }
      }

      // common fat-finger: players.json`
      if (!isSelf && code.includes('players.json`')) {
        logErr(file, 'Suspicious path: "players.json`" (stray backtick).');
      }
    } catch (e) {
      logErr(file, e.message.split('\n')[0]);
    }
  }

  // 3) JSON validity in data/**
  try {
    const dataDir = path.join(root, 'data');
    if (fs.existsSync(dataDir)) {
      for (const file of walk(dataDir)) {
        if (!file.endsWith('.json')) continue;
        try {
          JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
          logErr(file, `Invalid JSON: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.warn('[WARN] JSON scan skipped:', e.message);
  }

  if (bad) {
    console.error(`\nScan finished with ${bad} issue(s).`);
    process.exitCode = 1;
  } else {
    console.log('Scan finished: no issues found.');
  }
})();
