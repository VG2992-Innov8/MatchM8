const express = require('express');
const path = require('path');
const { writeFile, readFile, mkdir } = require('fs/promises');

const router = express.Router();
const DATA = path.join(__dirname,'..','data');
const FIXDIR = path.join(DATA,'fixtures','season-2025');
const PREDDIR = path.join(DATA,'predictions');

async function jsonOr(fp, fallback){ try{ return JSON.parse(await readFile(fp,'utf8')); }catch(e){ return fallback; } }
async function ensureDir(p){ await mkdir(p,{recursive:true}); }
const weekFile = (dir, w)=> path.join(dir, `week-${w}.json`);

router.get('/', async (req,res)=>{
  const w = parseInt(req.query.week,10); if(!w) return res.status(400).json({error:'week required'});
  const f = weekFile(PREDDIR,w); res.json(await jsonOr(f,{}));
});

router.post('/', express.json(), async (req,res)=>{
  const { week, player_id, name, predictions=[] } = req.body||{};
  const w = parseInt(week,10); if(!w) return res.status(400).json({error:'week required'});
  if(!player_id) return res.status(400).json({error:'player_id required'});

  const fixtures = await jsonOr(weekFile(FIXDIR,w),[]);
  const byId = new Map(fixtures.map(f=>[String(f.id),f]));
  const now = new Date();

  const cleaned = [];
  let skipped_locked = 0;
  for(const p of predictions){
    if(!p || p.id==null) continue;
    const f = byId.get(String(p.id)); if(!f) continue;
    const ko = f.kickoff_iso ? new Date(f.kickoff_iso) : null;
    if(ko && now >= ko){ skipped_locked++; continue; }
    const h = (p.home===''||p.home==null)?null:Number(p.home);
    const a = (p.away===''||p.away==null)?null:Number(p.away);
    if(h!=null && (!Number.isInteger(h)||h<0)) continue;
    if(a!=null && (!Number.isInteger(a)||a<0)) continue;
    cleaned.push({ id:f.id, home:h, away:a });
  }

  await ensureDir(PREDDIR);
  const storePath = weekFile(PREDDIR,w);
  const store = await jsonOr(storePath,{});
  store[player_id] = { name: name || store[player_id]?.name || String(player_id), predictions: cleaned, updatedAt: new Date().toISOString() };
  await writeFile(storePath, JSON.stringify(store,null,2),'utf8');

  res.json({ saved: cleaned.length, skipped_locked, total: predictions.length, stored: store[player_id] });
});

module.exports = router;
