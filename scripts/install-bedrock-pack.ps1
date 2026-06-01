# リポジトリの behavior pack を Minecraft Bedrock の各配置先へジャンクションで接続する。
# Launcher ではワールドが Users\<アカウントID>\ 配下にあることが多いため、Shared だけでなくアカウント側にも張る。

param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$src = Join-Path $RepoRoot "behavior_packs\robw_behavior"
if (-not (Test-Path (Join-Path $src "manifest.json"))) {
  throw "Pack not found: $src"
}

$mojangRoots = @(
  "$env:APPDATA\Minecraft Bedrock\Users\Shared\games\com.mojang"
)
Get-ChildItem "$env:APPDATA\Minecraft Bedrock\Users" -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne "Shared" } |
  ForEach-Object {
    $p = Join-Path $_.FullName "games\com.mojang"
    if (Test-Path (Split-Path $p -Parent)) { $mojangRoots += $p }
  }

$destNames = @("behavior_packs", "development_behavior_packs")
$created = @()

foreach ($root in ($mojangRoots | Select-Object -Unique)) {
  foreach ($folder in $destNames) {
    $parent = Join-Path $root $folder
    if (-not (Test-Path $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $dest = Join-Path $parent "robw_behavior"
    if (Test-Path $dest) {
      $item = Get-Item $dest -Force
      if ($item.LinkType -eq "Junction" -and $item.Target -contains $src) {
        Write-Host "OK (exists): $dest"
        continue
      }
      if ($item.LinkType -eq "Junction") {
        Remove-Item $dest -Force
      } else {
        Write-Warning "Skip (not junction): $dest"
        continue
      }
    }
    New-Item -ItemType Junction -Path $dest -Target $src -Force | Out-Null
    Write-Host "Linked: $dest -> $src"
    $created += $dest
  }
}

if ($created.Count -eq 0) {
  Write-Host "No new links (already configured or blocked)."
} else {
  Write-Host ""
  Write-Host "Done. Re-enter the world or run /reload, then try:"
  Write-Host "  /function robw/ping"
  Write-Host "  /scriptevent robw:menu run"
}
