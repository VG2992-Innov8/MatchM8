param(
  [string]$Root = "."
)

Write-Host "== Node syntax + require + JSON scan ==" -ForegroundColor Cyan
node "$Root\tools\syntax-check.js" $Root
$exit = $LASTEXITCODE

Write-Host "`n== Grep for suspicious patterns ==" -ForegroundColor Cyan
Get-ChildItem -Path $Root -Recurse -Include *.js |
  Select-String -Pattern 'players\.json`','[`][\s]*[,)\]]','[“”‘’]' |
  ForEach-Object { "{0}:{1}:{2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }

if ($exit -ne 0) {
  Write-Host "`nScan found issues. See above." -ForegroundColor Yellow
  exit 1
} else {
  Write-Host "`nLooks clean from the automated checks." -ForegroundColor Green
}
