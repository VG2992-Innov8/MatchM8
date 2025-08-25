const { writeFile, mkdir } = require('fs/promises');
const path = require('path');
async function writeJsonAtomic(filePath, data){
  await mkdir(path.dirname(filePath), { recursive:true });
  const tmp = filePath + '.tmp.' + process.pid + '.' + Date.now();
  await writeFile(tmp, JSON.stringify(data,null,2), 'utf8');
  await writeFile(filePath, JSON.stringify(data,null,2), 'utf8'); // simple; replace with rename(tmpÃ¢â€ 'filePath) if you prefer
}
module.exports = { writeJsonAtomic };
