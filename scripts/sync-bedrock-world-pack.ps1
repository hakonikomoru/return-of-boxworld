# ワールド内に埋め込まれた robw_behavior をリポジトリ内容で上書き同期する。
# パック有効化済みでも古いコピーが残っているときに /function が見つからない場合に使う。

param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$WorldName = ""
)

$ErrorActionPreference = "Stop"
$src = Join-Path $RepoRoot "behavior_packs\robw_behavior"
$packId = "a3f8c2e1-4b7d-4a9e-8f12-6d0e5c4b3a21"

$worldRoots = Get-ChildItem "$env:APPDATA\Minecraft Bedrock\Users" -Directory -ErrorAction SilentlyContinue |
  ForEach-Object { Join-Path $_.FullName "games\com.mojang\minecraftWorlds" } |
  Where-Object { Test-Path $_ }

$targets = @()
foreach ($wr in $worldRoots) {
  Get-ChildItem $wr -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $wbp = Join-Path $_.FullName "world_behavior_packs.json"
    if (-not (Test-Path $wbp)) { return }
    if ((Get-Content $wbp -Raw) -notmatch $packId) { return }
    if ($WorldName -and $_.Name -ne $WorldName) { return }
    $targets += Join-Path $_.FullName "behavior_packs\robw_behavior"
  }
}

if ($targets.Count -eq 0) {
  Write-Warning "No world with ROBW pack_id found."
  exit 1
}

foreach ($dest in ($targets | Select-Object -Unique)) {
  Write-Host "Sync -> $dest"
  if (Test-Path $dest) {
    Remove-Item $dest -Recurse -Force
  }
  New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  robocopy $src $dest /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }
}

Write-Host "Done. Re-enter world and try /function robw/ping"
