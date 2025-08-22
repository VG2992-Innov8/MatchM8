const path = require('path'); const { readFile } = require('fs/promises');
const { writeJsonAtomic } = require('../utils/atomicJson'); const bcrypt = require('bcryptjs');
(async()=>{
  const fp = path.join(__dirname,'..','data','players.json');
  const players = JSON.parse(await readFile(fp,'utf8'));
  let changed=0;
  for (const p of players) {
    if (p.pin && !p.pin_hash) {
      p.pin_hash = await bcrypt.hash(String(p.pin),10);
      delete p.pin; changed++;
    }
  }
  await writeJsonAtomic(fp, players);
  console.log(`Hashed ${changed} PIN(s).`);
})();
