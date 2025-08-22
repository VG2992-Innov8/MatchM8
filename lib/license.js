// lib/license.js
const fs = require('fs/promises');
const path = require('path');
const nacl = require('tweetnacl');
const { machineIdSync } = require('node-machine-id');

const PUBLIC_KEY_B64 = process.env.LICENSE_PUBKEY_B64 || 'PASTE_PUBLIC_KEY_BASE64';

const LICENSE_PATH = path.join(__dirname, '..', 'data', 'license.json');
const SIG_PATH     = path.join(__dirname, '..', 'data', 'license.sig');

function stableStringify(obj){
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '['+obj.map(stableStringify).join(',')+']';
  const keys = Object.keys(obj).sort();
  return '{'+keys.map(k=>JSON.stringify(k)+':'+stableStringify(obj[k])).join(',')+'}';
}
function b64ToU8(b){ return Uint8Array.from(Buffer.from(b,'base64')); }
async function readJson(fp){ return JSON.parse(await fs.readFile(fp,'utf8')); }

let _status = { ok:false, reason:'uninitialized', license:null };

async function loadAndValidate(){
  try{
    const [lic, sigB64] = await Promise.all([readJson(LICENSE_PATH), fs.readFile(SIG_PATH,'utf8').then(s=>s.trim())]);
    // 1) signature
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(stableStringify(lic)),
      b64ToU8(sigB64),
      b64ToU8(PUBLIC_KEY_B64)
    );
    if(!ok){ _status={ok:false, reason:'signature_invalid', license:lic}; return _status; }
    // 2) expiry
    const exp = new Date(lic.expires_utc);
    if (!exp || isNaN(exp) || new Date() > exp){ _status={ok:false, reason:'expired', license:lic}; return _status; }
    // 3) machine
    const local = machineIdSync(true);
    if (lic.machine?.id !== local){ _status={ok:false, reason:'wrong_machine', license:lic}; return _status; }
    // 4) max players sanity
    if (!lic.max_players || lic.max_players < 1){ _status={ok:false, reason:'bad_max_players', license:lic}; return _status; }

    _status={ok:true, reason:'ok', license:lic}; return _status;
  }catch(e){
    _status={ok:false, reason:'missing_or_invalid_files', license:null}; return _status;
  }
}
const getStatus = ()=>_status;
const requireLicense = (req,res,next)=> _status.ok ? next() : res.status(403).json({error:'License invalid: '+_status.reason});

module.exports = { loadAndValidate, getStatus, requireLicense };
