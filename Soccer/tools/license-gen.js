// tools/license-gen.js
const nacl = require('tweetnacl');

function stableStringify(obj){
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k)+':'+stableStringify(obj[k])).join(',') + '}';
}

if (process.argv[2]==='gen-keys'){
  const kp = nacl.sign.keyPair(); // 32-byte pub, 64-byte secret
  console.log('PUBLIC_KEY_B64=', Buffer.from(kp.publicKey).toString('base64'));
  console.log('PRIVATE_KEY_B64=', Buffer.from(kp.secretKey).toString('base64'));
  process.exit(0);
}

if (process.argv[2]==='sign'){
  const key = process.env.PRIVATE_KEY_B64;
  if (!key){ console.error('Set PRIVATE_KEY_B64'); process.exit(1); }
  const sk = Uint8Array.from(Buffer.from(key,'base64'));
  if (sk.length !== 64){ console.error('bad secret key size'); process.exit(1); }

  const chunks=[]; process.stdin.on('data',d=>chunks.push(d));
  process.stdin.on('end', ()=>{
    const txt = Buffer.concat(chunks).toString('utf8');
    const obj = JSON.parse(txt);
    const stable = Buffer.from(stableStringify(obj));
    const sig = nacl.sign.detached(new Uint8Array(stable), sk);
    process.stdout.write(Buffer.from(sig).toString('base64'));
  });
} else {
  console.log('Usage:\n  node tools/license-gen.js gen-keys\n  PRIVATE_KEY_B64=... node tools/license-gen.js sign < data/license.json > data/license.sig');
}
