const path = require('path'); const { readFile } = require('fs/promises');
const nodemailer = require('nodemailer');

const DATA = path.join(__dirname,'..','data');
const W = process.argv[2] ? Number(process.argv[2]) : 1;

function j(fp){ return readFile(fp,'utf8').then(JSON.parse).catch(()=>null); }

(async()=>{
  // env
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if(!SMTP_HOST) { console.error('Missing SMTP_* in .env'); process.exit(1); }
  const tx = nodemailer.createTransport({ host:SMTP_HOST, port:Number(SMTP_PORT||587), secure:false, auth: SMTP_USER?{user:SMTP_USER, pass:SMTP_PASS}:undefined });

  const players = await j(path.join(DATA,'players.json')) || [];
  const preds   = await j(path.join(DATA,'predictions',`week-${W}.json`)) || {};
  const fixtures= await j(path.join(DATA,'fixtures','season-2025',`week-${W}.json`)) || [];

  // first kickoff
  const first = fixtures.map(f=>new Date(f.kickoff_iso||0)).filter(d=>!isNaN(d)).sort((a,b)=>a-b)[0];
  if(!first){ console.log('No fixtures'); process.exit(0); }
  const hoursToGo = (first - new Date())/36e5;
  if (hoursToGo > 26) { console.log('>26h to first kickoff; skip'); process.exit(0); }

  const missing = players.filter(p => !p.email ? false : !preds[p.id]);
  for(const p of missing){
    const info = await tx.sendMail({
      from: SMTP_FROM || 'MatchM8 <no-reply@matchm8.local>',
      to: p.email,
      subject: `Reminder: enter week ${W} predictions`,
      text: `Hi ${p.name||'player'},\n\nQuick reminder to enter your week ${W} predictions before kickoff.\n\nThanks,\nMatchM8`
    });
    console.log('Sent to', p.email, info.messageId);
  }
})();
