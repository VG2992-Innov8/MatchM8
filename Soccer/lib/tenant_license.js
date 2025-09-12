// lib/tenant_license.js
const crypto = require('crypto');

function b64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr));
  return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(str) {
  str = str.replace(/-/g,'+').replace(/_/g,'/'); while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

// token = base64url(jsonPayload) + "." + base64url(HMAC_SHA256(payload, LICENSE_SECRET))
function verify(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return { ok:false, reason:'malformed' };
  if (!secret) return { ok:false, reason:'missing LICENSE_SECRET' };

  const [body, sig] = token.split('.');
  const expected = b64urlEncode(crypto.createHmac('sha256', secret).update(body).digest());
  if (sig !== expected) return { ok:false, reason:'bad signature' };

  let claims;
  try { claims = JSON.parse(b64urlDecode(body)); }
  catch { return { ok:false, reason:'bad payload' }; }

  return { ok:true, claims };
}

module.exports = { verify };
