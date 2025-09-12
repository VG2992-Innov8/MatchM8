param(
  [string]$LicenseSourcePath = "..\MatchM8\data",  # where license.json/sig live in your main app
  [switch]$ResetFixtures,                           # include to reset fixtures to a tiny Week 1
  [switch]$WriteEnv,                                # include to (re)create a demo .env
  [int]$TotalWeeks = 5,
  [int]$Port = 3001,
  [int]$DemoPlayersMax = 5,
  [string]$Brand = "MatchM8 (Demo)",
  [string]$League = "English Premier League"
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$p){
  if(-not (Test-Path $p)){ New-Item -ItemType Directory -Force -Path $p | Out-Null }
}

# Resolve key paths (script dir -> repo root)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..") | Select-Object -ExpandProperty Path

$dataDir       = Join-Path $root "data"
$fixturesDir   = Join-Path $dataDir "fixtures\season-2025"
$resultsDir    = Join-Path $dataDir "results"
$predictionsDir= Join-Path $dataDir "predictions"
$scoresWeeks   = Join-Path $dataDir "scores\weeks"
$configPath    = Join-Path $dataDir "config.json"
$envPath       = Join-Path $root ".env"
$publicDir     = Join-Path $root "public"
$publicCfgPath = Join-Path $publicDir "config.js"

Write-Host "=== MatchM8 Demo Reset ===" -ForegroundColor Cyan
Write-Host "Root: $root" -ForegroundColor DarkCyan

# Ensure base dirs
Ensure-Dir $dataDir
Ensure-Dir (Join-Path $dataDir "scores")
Ensure-Dir $publicDir

# 1) Clear player/results/predictions/scores (safe if already empty)
Write-Host "• Clearing players/predictions/results/scores…" -ForegroundColor Yellow
Remove-Item (Join-Path $dataDir "players.json") -Force -ErrorAction SilentlyContinue
Remove-Item $predictionsDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $resultsDir     -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $scoresWeeks    -Recurse -Force -ErrorAction SilentlyContinue
Ensure-Dir $predictionsDir
Ensure-Dir $resultsDir
Ensure-Dir $scoresWeeks

# 2) Fixtures (optional reset)
if($ResetFixtures){
  Write-Host "• Resetting fixtures to Week 1 sample…" -ForegroundColor Yellow
  Remove-Item $fixturesDir -Recurse -Force -ErrorAction SilentlyContinue
  Ensure-Dir $fixturesDir
  @'
[
  {"id":"fixture_arsenal_spurs","home":"Arsenal","away":"Spurs"},
  {"id":"fixture_chelsea_liverpool","home":"Chelsea","away":"Liverpool"}
]
'@ | Set-Content -Encoding UTF8 (Join-Path $fixturesDir "week-1.json")
}else{
  Write-Host "• Leaving existing fixtures as-is." -ForegroundColor DarkYellow
}

# 3) Copy license files from main repo (if present)
$srcJson = Join-Path $LicenseSourcePath "license.json"
$srcSig  = Join-Path $LicenseSourcePath "license.sig"

if ((Test-Path $srcJson) -and (Test-Path $srcSig)) {
  Copy-Item $srcJson $dataDir -Force
  Copy-Item $srcSig  $dataDir -Force
  Write-Host "• Copied license files from $LicenseSourcePath" -ForegroundColor Green
} else {
  Write-Host "• License files not found at $LicenseSourcePath (skipping). Admin/scores may be gated." -ForegroundColor DarkYellow
}

# 4) Write demo config.json
Write-Host "• Writing demo data/config.json (total_weeks=$TotalWeeks)…" -ForegroundColor Yellow
@{
  season = 2025
  total_weeks = $TotalWeeks
  current_week = 1
  lock_minutes_before_kickoff = 10
  deadline_mode = "first_kickoff"
  timezone = "Australia/Melbourne"
} | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $configPath

# 5) Optional .env for demo
if($WriteEnv){
  Write-Host "• Writing .env (PORT=$Port, DEMO_PLAYERS_MAX=$DemoPlayersMax)…" -ForegroundColor Yellow
@"
PORT=$Port
ADMIN_TOKEN=demoADMIN123!
LICENSE_PUBKEY_B64=JcLv0Y7Ee/rhBA1uBBg6VgpfIK4Y/m4a9qHbXY2lHkXY=
ALLOW_SELF_SIGNUP=true
INVITE_CODE=
WHITELIST_EMAIL_DOMAIN=
CORS_ORIGIN=http://localhost:$Port
DEMO_PLAYERS_MAX=$DemoPlayersMax
"@ | Set-Content -Encoding UTF8 $envPath
}else{
  Write-Host "• .env left unchanged (pass -WriteEnv to overwrite/create)." -ForegroundColor DarkYellow
}

# 6) Public branding config (created if missing)
if(-not (Test-Path $publicCfgPath)){
  Write-Host "• Creating public/config.js (brand/league)…" -ForegroundColor Yellow
@"
window.MATCHM8_BRAND  = '$Brand';
window.MATCHM8_LEAGUE = '$League';
"@ | Set-Content -Encoding UTF8 $publicCfgPath
}else{
  Write-Host "• public/config.js already exists (leaving as-is)." -ForegroundColor DarkYellow
}

Write-Host "=== Done. ===" -ForegroundColor Cyan
Write-Host "Tips:" -ForegroundColor Gray
Write-Host " - Start demo:  node index.js  (or set PORT=$Port in .env)" -ForegroundColor Gray
Write-Host " - Open:        http://localhost:$Port" -ForegroundColor Gray
Write-Host " - Admin login: Name=Admin, use password box; first run will ask you to set one." -ForegroundColor Gray
Write-Host " - Player cap:  DEMO_PLAYERS_MAX=$DemoPlayersMax (enforced by routes/players.js override)" -ForegroundColor Gray
