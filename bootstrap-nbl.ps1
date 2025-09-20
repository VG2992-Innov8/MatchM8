<# bootstrap-nbl.ps1
Creates NBL-2025 demo data:
  1) competition config (10 weeks)
  2) scores/rules.json (basketball_close)
  3) players.json (Alice, Bob, Charlie, Dana, Evan)
  4) fixtures for 10 weeks (one game/week)
  5) results for all 10 games
  6) predictions for all 5 players for all 10 weeks
#>

[CmdletBinding()]
param(
  [string]$CompDir = (Join-Path -Path "Soccer" -ChildPath "data\tenants\Basketball\competitions\NBL-2025")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-JsonFile($Path, $Object) {
  $dir = Split-Path -Parent $Path
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $json = $Object | ConvertTo-Json -Depth 8
  $json | Out-File -FilePath $Path -Encoding utf8
}

# --- Paths
$fixturesDir = Join-Path $CompDir "fixtures\season-2025"
$resultsDir  = Join-Path $CompDir "results"
$predDir     = Join-Path $CompDir "predictions"
$scoresDir   = Join-Path $CompDir "scores"

# --- (1) Competition config
$config = @{
  season = 2025
  total_weeks = 10
  current_week = 10
  lock_minutes_before_kickoff = 10
  deadline_mode = "first_kickoff"
  timezone = "Australia/Melbourne"
}
Write-JsonFile -Path (Join-Path $CompDir "config.json") -Object $config

# --- (2) Scoring rules (basketball_close)
$rules = @{
  mode = "basketball_close"
  perTeam = @{ exact = 15; within5 = 10; within10 = 5 }
  thresholds = @{ within5 = 5; within10 = 10 }
  winnerPoints = 0
}
Write-JsonFile -Path (Join-Path $scoresDir "rules.json") -Object $rules

# --- (3) Players
$players = @(
  @{ id = "alice";   name = "Alice";   email = "alice@example.com" },
  @{ id = "bob";     name = "Bob";     email = "bob@example.com" },
  @{ id = "charlie"; name = "Charlie"; email = "charlie@example.com" },
  @{ id = "dana";    name = "Dana";    email = "dana@example.com" },
  @{ id = "evan";    name = "Evan";    email = "evan@example.com" }
)
Write-JsonFile -Path (Join-Path $CompDir "players.json") -Object $players

# --- (4) Fixtures (10 weeks, 1 game/week)
$fixturesByWeek = @{
  1  = @(@{ id="W01"; home="Sydney Kings";     away="Melbourne United"; kickoffISO="2025-01-05T09:00:00Z" })
  2  = @(@{ id="W02"; home="Sydney Kings";     away="Perth Wildcats";   kickoffISO="2025-01-12T09:00:00Z" })
  3  = @(@{ id="W03"; home="Sydney Kings";     away="Brisbane Bullets"; kickoffISO="2025-01-19T09:00:00Z" })
  4  = @(@{ id="W04"; home="Sydney Kings";     away="Illawarra Hawks";  kickoffISO="2025-01-26T09:00:00Z" })
  5  = @(@{ id="W05"; home="Melbourne United"; away="Perth Wildcats";   kickoffISO="2025-02-02T09:00:00Z" })
  6  = @(@{ id="W06"; home="Melbourne United"; away="Brisbane Bullets"; kickoffISO="2025-02-09T09:00:00Z" })
  7  = @(@{ id="W07"; home="Melbourne United"; away="Illawarra Hawks";  kickoffISO="2025-02-16T09:00:00Z" })
  8  = @(@{ id="W08"; home="Perth Wildcats";   away="Brisbane Bullets"; kickoffISO="2025-02-23T09:00:00Z" })
  9  = @(@{ id="W09"; home="Perth Wildcats";   away="Illawarra Hawks";  kickoffISO="2025-03-02T09:00:00Z" })
  10 = @(@{ id="W10"; home="Brisbane Bullets"; away="Illawarra Hawks";  kickoffISO="2025-03-09T09:00:00Z" })
}

# --- (5) Results
$resultsByWeek = @{
  1  = @{ "W01" = @{ home=92;  away=88 } }
  2  = @{ "W02" = @{ home=101; away=97 } }
  3  = @{ "W03" = @{ home=95;  away=102 } }
  4  = @{ "W04" = @{ home=110; away=99 } }
  5  = @{ "W05" = @{ home=89;  away=94 } }
  6  = @{ "W06" = @{ home=103; away=98 } }
  7  = @{ "W07" = @{ home=90;  away=84 } }
  8  = @{ "W08" = @{ home=112; away=105 } }
  9  = @{ "W09" = @{ home=100; away=96 } }
  10 = @{ "W10" = @{ home=97;  away=101 } }
}

# --- (6) Predictions (5 players each week; one match per week)
$predByWeek = @{
  1  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W01"; home=95;  away=90 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W01"; home=89;  away=92 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W01"; home=90;  away=88 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W01"; home=102; away=95 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W01"; home=92;  away=87 }) }
       }
  2  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W02"; home=104; away=99 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W02"; home=98;  away=102 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W02"; home=101; away=97 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W02"; home=110; away=103 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W02"; home=100; away=96 }) }
       }
  3  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W03"; home=96;  away=100 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W03"; home=92;  away=104 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W03"; home=94;  away=101 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W03"; home=105; away=110 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W03"; home=90;  away=98 }) }
       }
  4  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W04"; home=112; away=100 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W04"; home=108; away=103 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W04"; home=109; away=98 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W04"; home=120; away=111 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W04"; home=110; away=99 }) }
       }
  5  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W05"; home=90;  away=92 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W05"; home=88;  away=96 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W05"; home=85;  away=90 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W05"; home=99;  away=104 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W05"; home=91;  away=95 }) }
       }
  6  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W06"; home=105; away=100 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W06"; home=102; away=101 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W06"; home=100; away=97 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W06"; home=112; away=108 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W06"; home=103; away=98 }) }
       }
  7  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W07"; home=92;  away=86 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W07"; home=88;  away=85 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W07"; home=90;  away=82 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W07"; home=100; away=95 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W07"; home=89;  away=84 }) }
       }
  8  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W08"; home=114; away=108 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W08"; home=110; away=107 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W08"; home=112; away=104 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W08"; home=120; away=115 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W08"; home=111; away=106 }) }
       }
  9  = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W09"; home=102; away=98 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W09"; home=97;  away=99 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W09"; home=98;  away=95 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W09"; home=110; away=104 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W09"; home=100; away=96 }) }
       }
  10 = @{
         alice   = @{ player_id="alice";   predictions=@(@{ id="W10"; home=98;  away=100 }) }
         bob     = @{ player_id="bob";     predictions=@(@{ id="W10"; home=95;  away=103 }) }
         charlie = @{ player_id="charlie"; predictions=@(@{ id="W10"; home=96;  away=100 }) }
         dana    = @{ player_id="dana";    predictions=@(@{ id="W10"; home=107; away=111 }) }
         evan    = @{ player_id="evan";    predictions=@(@{ id="W10"; home=97;  away=101 }) }
       }
}

# --- Write everything
New-Item -ItemType Directory -Force -Path $fixturesDir, $resultsDir, $predDir, $scoresDir | Out-Null

1..10 | ForEach-Object {
  $w = $_
  $fxPath = Join-Path $fixturesDir ("week-{0}.json" -f $w)
  $rsPath = Join-Path $resultsDir  ("week-{0}.json" -f $w)
  $prPath = Join-Path $predDir     ("week-{0}.json" -f $w)

  Write-JsonFile -Path $fxPath -Object $fixturesByWeek[$w]
  Write-JsonFile -Path $rsPath -Object $resultsByWeek[$w]
  Write-JsonFile -Path $prPath -Object $predByWeek[$w]
}

Write-Host "✅ Demo data written to:" -ForegroundColor Green
Write-Host "   $CompDir"
Write-Host ""
Write-Host "Now you can hit:" -ForegroundColor Cyan
Write-Host "  • /api/scores/compute?week=10 (or each week 1..10)"
Write-Host "  • /Part_C_Leaderboard.html?t=Basketball&c=NBL-2025"
Write-Host "  • /Part_B_Predictions.html?t=Basketball&c=NBL-2025&week=10"
