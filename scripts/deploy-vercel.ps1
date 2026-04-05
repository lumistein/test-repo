$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$globalConfigDir = Join-Path $projectRoot ".vercel-global"
$envFile = Join-Path $projectRoot ".env.local"

New-Item -ItemType Directory -Force -Path $globalConfigDir | Out-Null

if (-not (Test-Path $envFile)) {
  throw ".env.local 파일이 없습니다. .env.example을 복사해서 먼저 채워주세요."
}

$envMap = @{}

foreach ($line in Get-Content $envFile) {
  if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
    continue
  }

  $separatorIndex = $line.IndexOf("=")

  if ($separatorIndex -lt 1) {
    continue
  }

  $name = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1).Trim()
  $envMap[$name] = $value
}

$requiredVariables = @(
  "UPSTREAM_CHAT_COMPLETIONS_URL",
  "UPSTREAM_MODEL",
  "UPSTREAM_API_KEY",
  "SITE_TITLE",
  "SITE_DESCRIPTION"
)

foreach ($name in $requiredVariables) {
  if (-not $envMap.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($envMap[$name])) {
    throw "필수 환경변수 '$name' 이(가) .env.local 에 없습니다."
  }
}

$env:npm_config_cache = Join-Path $projectRoot ".npm-cache"

function Invoke-Vercel {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & npx "vercel@latest" @Arguments "--global-config" $globalConfigDir

  if ($LASTEXITCODE -ne 0) {
    throw "Vercel CLI 명령이 실패했습니다: npx vercel@latest $($Arguments -join ' ')"
  }
}

try {
  Invoke-Vercel -Arguments @("whoami")
} catch {
  Write-Host "Vercel 로그인이 필요합니다. 브라우저에서 인증을 완료한 뒤 스크립트를 다시 실행해주세요."
  & npx "vercel@latest" "login" "--global-config" $globalConfigDir

  if ($LASTEXITCODE -ne 0) {
    throw "Vercel 로그인에 실패했거나 취소되었습니다."
  }
}

Invoke-Vercel -Arguments @("link", "--yes")

$targets = @("development", "preview", "production")

foreach ($name in $requiredVariables) {
  foreach ($target in $targets) {
    Invoke-Vercel -Arguments @(
      "env",
      "add",
      $name,
      $target,
      "--value",
      $envMap[$name],
      "--yes",
      "--force"
    )
  }
}

Invoke-Vercel -Arguments @("--prod", "--yes")
