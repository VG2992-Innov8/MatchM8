// Soccer/seed.js
const fs = require('fs');
const path = require('path');

function copyTreeIfMissing(src, dst) {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dst)) return false;                 // don't overwrite real data
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, force: false, errorOnExist: true });
  return true;
}

function ensureSeedsFor(tenantDir, compDir) {
  try {
    const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
    const repoSeedRoot = path.join(__dirname, 'data', '_seed');
    // rel = "<TENANT>/competitions/<COMP>"
    const rel = path.relative(path.join(DATA_DIR, 'tenants'), compDir);
    const srcRoot = path.join(repoSeedRoot, rel);

    // Add more folders here later (predictions/scores/etc.)
    const seededFixtures = copyTreeIfMissing(
      path.join(srcRoot, 'fixtures'),
      path.join(compDir,  'fixtures')
    );
    return seededFixtures;
  } catch {
    return false;
  }
}

module.exports = { ensureSeedsFor };
