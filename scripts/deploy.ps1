# Linux ZIP deploy for Node on Azure App Service (Kudu-only + self-heal SCM auth/IP + long timeout)
# Usage:
#   .\scripts\deploy.ps1 -ResourceGroup rg-mermaid -AppServiceName app-mermaid-xyz [-KeyVaultName kv-...] [-BuildLocally] [-UploadTimeoutSec 1800]

param(
  [Parameter(Mandatory = $true)] [string]$ResourceGroup,
  [Parameter(Mandatory = $true)] [string]$AppServiceName,
  [string]$KeyVaultName,
  [switch]$BuildLocally,
  [int]$UploadTimeoutSec = 1800  # 30 mins
)

$ErrorActionPreference  = 'Stop'
$ProgressPreference     = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol  = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::Expect100Continue = $true

function Write-Info { param($m) Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Write-Warn { param($m) Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Write-Ok   { param($m) Write-Host "[OK]   $m" -ForegroundColor Green }
function Write-Err  { param($m) Write-Host "[ERR]  $m" -ForegroundColor Red }

# ---------- KUDU HELPERS ----------
function Get-KuduCreds {
  param([string]$ResourceGroup,[string]$AppServiceName)
  $xml = az webapp deployment list-publishing-profiles `
           --resource-group $ResourceGroup `
           --name $AppServiceName `
           --xml
  if (-not $xml) { throw "No publishing profile XML returned by Azure CLI." }
  [xml]$doc = $xml
  $profile = $doc.publishData.publishProfile | Where-Object { $_.publishUrl -like "*.scm.azurewebsites.net*" } | Select-Object -First 1
  if (-not $profile) { $profile = $doc.publishData.publishProfile | Select-Object -First 1 }
  if (-not $profile) { throw "No publishing profile found in XML." }
  $kuduHost = $profile.publishUrl
  if ($kuduHost -notlike "*.scm.azurewebsites.net*") { $kuduHost = "$AppServiceName.scm.azurewebsites.net" }
  [pscustomobject]@{ Host=$kuduHost; User=$profile.userName; Pass=$profile.userPWD }
}

function Wait-ForScm {
  param([string]$ResourceGroup,[string]$AppServiceName,[int]$MaxSeconds=300)
  Write-Info "Waiting for SCM endpoint to respond..."
  $c = Get-KuduCreds -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
  $url = "https://$($c.Host)/api/"
  $deadline = (Get-Date).AddSeconds($MaxSeconds)
  $delay = 2
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -ErrorAction Stop
      Write-Ok "SCM responded: $($r.StatusCode)"; return $true
    } catch {
      $status = $null; try { $status = $_.Exception.Response.StatusCode.value__ } catch {}
      if ($status -in 401,403) { Write-Ok "SCM up (HTTP $status)"; return $true }
      Start-Sleep -Seconds $delay
      $delay = [Math]::Min([int]([double]$delay * 1.5), 15)
    }
  }
  Write-Warn "SCM did not respond within $MaxSeconds seconds."
  return $false
}

function Get-KuduLatestDeployment {
  param([string]$ResourceGroup,[string]$AppServiceName)
  $c   = Get-KuduCreds -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
  $uri = "https://$($c.Host)/api/deployments/latest"
  $cred = New-Object System.Management.Automation.PSCredential($c.User,(ConvertTo-SecureString $c.Pass -AsPlainText -Force))
  try { Invoke-RestMethod -Uri $uri -Authentication Basic -Credential $cred -TimeoutSec 20 -Method GET } catch { $null }
}

function Show-KuduLogs {
  param([string]$ResourceGroup,[string]$AppServiceName)
  $c = Get-KuduCreds -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
  $latest = Get-KuduLatestDeployment -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
  if (-not $latest) { Write-Warn "No latest deployment info available."; return }
  $cred = New-Object System.Management.Automation.PSCredential($c.User,(ConvertTo-SecureString $c.Pass -AsPlainText -Force))

  if ($latest.log_url) {
    Write-Info "---- Kudu top-level log ----"
    try { (Invoke-RestMethod -Uri $latest.log_url -Authentication Basic -Credential $cred -TimeoutSec 30) | Select-Object -First 200 | ForEach-Object { $_ } } catch { Write-Warn "Failed to fetch Kudu log_url." }
  }
  if ($latest.url) {
    Write-Info "---- Kudu deployment items ----"
    try {
      $items = Invoke-RestMethod -Uri $latest.url -Authentication Basic -Credential $cred -TimeoutSec 30
      foreach ($it in $items) {
        if ($it.log_time -and $it.message) { Write-Host ("[{0}] {1}" -f $it.log_time, $it.message) }
        elseif ($it.message) { Write-Host $it.message }
      }
    } catch { Write-Warn "Failed to fetch Kudu deployment items." }
  }
}

function Wait-ForKuduDeployment {
  param([string]$ResourceGroup,[string]$AppServiceName,[int]$TimeoutSec=1800)
  Write-Info "Polling Kudu for deployment result..."
  $stopAt = (Get-Date).AddSeconds($TimeoutSec)
  $sleep = 5
  while ((Get-Date) -lt $stopAt) {
    $r = Get-KuduLatestDeployment -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
    if ($r) {
      $status = [int]$r.status  # 0=pending, 1=building, 2=deploying, 3=failed, 4=success
      $text   = $r.status_text
      if ($status -eq 4) { Write-Ok "Kudu: SUCCESS"; return $true }
      if ($status -eq 3) { Write-Err "Kudu: FAILED ($text)"; Show-KuduLogs -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName; return $false }
      Write-Info ("Kudu: {0} ({1})" -f $status, $text)
    } else {
      Write-Info "Kudu status not reachable yet..."
    }
    Start-Sleep -Seconds $sleep
    $sleep = [Math]::Min([int]([double]$sleep * 1.5), 30)
  }
  Write-Warn "Timed out waiting for Kudu deployment status."
  Show-KuduLogs -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
  return $false
}

# ---------- SELF-HEAL: SCM auth & access ----------
function Ensure-ScmCanZipDeploy {
  param([string]$ResourceGroup,[string]$AppServiceName)

  # 1) If SCM Basic Auth was disabled, re-enable it (needed for zipdeploy)
  $sub = az account show --query id -o tsv
  $webCfgUri = "/subscriptions/$sub/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$AppServiceName/config/web?api-version=2023-01-01"
  try {
    $scmBasic = az rest --method GET --uri $webCfgUri --query "properties.scmBasicAuthEnabled" -o tsv 2>$null
    if ($scmBasic -eq "false") {
      Write-Warn "SCM Basic Auth is DISABLED – enabling it so zipdeploy can authenticate..."
      $body = '{"properties":{"scmBasicAuthEnabled":true}}'
      az rest --method PATCH --uri $webCfgUri --headers "Content-Type=application/json" --body $body --only-show-errors --output none
      Write-Ok "SCM Basic Auth enabled."
    } elseif ($scmBasic -eq "true") {
      Write-Info "SCM Basic Auth already enabled."
    } else {
      Write-Info "Could not read scmBasicAuthEnabled (property may not exist on this SKU). Continuing..."
    }
  } catch {
    Write-Warn "Failed to query/patch scmBasicAuthEnabled: $($_.Exception.Message)"
  }

  # 2) If SCM Access Restrictions deny by default, allow current public IP
  try {
    $ar = az webapp config access-restriction show -g $ResourceGroup -n $AppServiceName | ConvertFrom-Json
    $deny = $ar.scmIpSecurityRestrictionsDefaultAction -eq "Deny"
    $hasAllow = $false
    if ($ar.scmIpSecurityRestrictions) {
      $hasAllow = $null -ne ($ar.scmIpSecurityRestrictions | Where-Object { $_.action -eq "Allow" })
    }
    if ($deny -and -not $hasAllow) {
      Write-Warn "SCM access is DENY by default and no allow rules found – adding a temporary allow for your public IP..."
      $myIp = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10)
      if ($myIp -and $myIp -match '^\d{1,3}(\.\d{1,3}){3}$') {
        $rule = "TempAllowDeploy-$($myIp.Replace('.','-'))"
        az webapp config access-restriction add `
          -g $ResourceGroup -n $AppServiceName `
          --rule-name $rule --action Allow --ip-address "$myIp/32" `
          --priority 100 --scm-site true --output none
        Write-Ok "Added SCM allow rule for $myIp."
      } else {
        Write-Warn "Could not determine your public IP; if deployment still hits 403, add an SCM allow rule for your IP."
      }
    } else {
      Write-Info "SCM access restrictions look OK (default = $($ar.scmIpSecurityRestrictionsDefaultAction))."
    }
  } catch {
    Write-Warn "Could not read/update SCM access restrictions: $($_.Exception.Message)"
  }
}

function Test-KuduConnectivity {
  param([string]$ResourceGroup, [string]$AppServiceName)
  
  Write-Info "Testing Kudu connectivity..."
  $creds = Get-KuduCreds -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
  $testEndpoints = @(
    "https://$($creds.Host)/api/",
    "https://$($creds.Host)/api/vfs/",
    "https://$($creds.Host)/api/deployments/"
  )
  
  foreach ($endpoint in $testEndpoints) {
    try {
      $response = Invoke-WebRequest -Uri $endpoint -Method GET -TimeoutSec 30 -UseBasicParsing
      Write-Ok "✓ $endpoint - Status: $($response.StatusCode)"
    } catch {
      Write-Warn "✗ $endpoint - Error: $($_.Exception.Message)"
    }
  }
}

function Invoke-KuduZipDeploy {
  param([string]$ResourceGroup,[string]$AppServiceName,[string]$ZipPath,[switch]$Async,[int]$TimeoutSec)

  $c   = Get-KuduCreds -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
  $uri = "https://$($c.Host)/api/zipdeploy"
  if ($Async) { $uri += "?isAsync=true" }

  $pair = "{0}:{1}" -f $c.User, $c.Pass
  $b64  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
  $authHeader = "Basic $b64"

  Write-Info "Uploading ZIP to Kudu ZIP API ($([IO.Path]::GetFileName($ZipPath)))..."

  # First attempt: HttpClient with long timeout
  try {
    $handler = New-Object System.Net.Http.HttpClientHandler
    $client  = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
    $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Basic",$b64)

    $fs = [System.IO.File]::Open($ZipPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
      $content = New-Object System.Net.Http.StreamContent($fs)
      $content.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream")
      $resp = $client.PostAsync($uri, $content).GetAwaiter().GetResult()
      if (-not $resp.IsSuccessStatusCode) {
        $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        throw "HTTP $($resp.StatusCode) $body"
      }
      Write-Ok "Kudu accepted ZIP (async=$($Async.IsPresent))."
      return
    } finally {
      $fs.Dispose(); $client.Dispose()
    }
  } catch {
    Write-Warn "HttpClient upload failed: $($_.Exception.Message)"
    Write-Info "Falling back to Invoke-WebRequest -InFile with -TimeoutSec $TimeoutSec..."
    try {
      Invoke-WebRequest -Uri $uri -Headers @{ Authorization = $authHeader } -Method POST -InFile $ZipPath -TimeoutSec $TimeoutSec | Out-Null
      Write-Ok "Kudu accepted ZIP via Invoke-WebRequest (async=$($Async.IsPresent))."
      return
    } catch {
      throw "Kudu zipdeploy failed: $($_.Exception.Message)"
    }
  }
}

# ---------- LOCATE & STAGE ----------
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = if ($scriptDir -like "*\scripts") { Split-Path -Parent $scriptDir } else { $scriptDir }

$stage   = Join-Path $env:TEMP ("mermaid-deploy-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$zipPath = Join-Path $scriptDir "mermaid-deployment.zip"
$hcFile  = Join-Path $env:TEMP ("healthcheck-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".json")

Write-Info "Staging: $stage"
Remove-Item $stage -Recurse -Force -ErrorAction Ignore
Remove-Item $zipPath -Force -ErrorAction Ignore
New-Item -ItemType Directory -Path $stage | Out-Null

# ---------- BUILD PACKAGE ----------
Write-Info "Copy package.json / package-lock.json..."
Copy-Item (Join-Path $projectRoot "package.json") (Join-Path $stage "package.json")
$pkgLock = Join-Path $projectRoot "package-lock.json"
if (Test-Path $pkgLock) { Copy-Item $pkgLock (Join-Path $stage "package-lock.json"); Write-Info "Copied package-lock.json" } else { Write-Warn "No package-lock.json found" }

Write-Info "Copy src/ ..."
Copy-Item (Join-Path $projectRoot "src") (Join-Path $stage "src") -Recurse
Remove-Item (Join-Path $stage "src\logs") -Recurse -Force -ErrorAction Ignore
Write-Ok "Copied src/ directory"

if ($BuildLocally) {
  Write-Info "BuildLocally: 'npm ci --omit=dev' in staging to include node_modules..."
  Push-Location $stage; try { npm ci --omit=dev; Write-Ok "npm ci complete (production deps)." } finally { Pop-Location }
} else {
  Write-Info "Skipping local npm install; Oryx will build on Kudu."
}

Write-Info "Create ZIP..."
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force

# Check ZIP size for potential timeout issues
$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Info "ZIP package size: $([math]::Round($zipSize, 2)) MB"
if ($zipSize -gt 100) {
  Write-Warn "Large ZIP file ($([math]::Round($zipSize, 2)) MB) may cause upload timeouts. Consider optimizing package size."
}

# ---------- DISCOVER KV (optional) ----------
if (-not $KeyVaultName) {
  $envFile = Join-Path $projectRoot ".env"
  if (Test-Path $envFile) {
    $kvLine = Select-String -Path $envFile -Pattern '^\s*KEY_VAULT_NAME\s*=\s*(.+)\s*$' -ErrorAction Ignore | Select-Object -First 1
    if ($kvLine) { $KeyVaultName = ($kvLine.Matches[0].Groups[1].Value).Trim() }
  }
}
if ($KeyVaultName) { Write-Info ("Using Key Vault: {0} (set as app setting)" -f $KeyVaultName) }

# ---------- RUNTIME / APP SETTINGS ----------
Write-Info "Harden app config for Linux/Node..."
$siteId = az webapp show --resource-group $ResourceGroup --name $AppServiceName --query id -o tsv

# Force Node 20 safely (no '|' shell issues)
$subId = az account show --query id -o tsv
$webCfgUri = "/subscriptions/$subId/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$AppServiceName/config/web?api-version=2023-01-01"
$webCfgFile = Join-Path $env:TEMP ("webcfg-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".json")
'{"properties":{"linuxFxVersion":"NODE|20-lts"}}' | Out-File -FilePath $webCfgFile -Encoding ascii -Force
az rest --method PATCH --uri $webCfgUri --headers "Content-Type=application/json" --body "@$webCfgFile" --only-show-errors --output none
$fxNow = az webapp config show --resource-group $ResourceGroup --name $AppServiceName --query linuxFxVersion -o tsv
Write-Info ("linuxFxVersion now: {0}" -f $fxNow)
Remove-Item $webCfgFile -Force -ErrorAction Ignore

# Remove "run from package" flags so Kudu actually builds/unpacks
az webapp config appsettings delete --resource-group $ResourceGroup --name $AppServiceName `
  --setting-names WEBSITE_RUN_FROM_PACKAGE WEBSITE_RUN_FROM_ZIP --only-show-errors --output none

# Remove legacy Windows Node default (harmless if absent)
az webapp config appsettings delete --resource-group $ResourceGroup --name $AppServiceName `
  --setting-names WEBSITE_NODE_DEFAULT_VERSION --only-show-errors --output none

# Ensure Oryx (or skip if local build), long idle, prod, port, KV
$settings = @(
  "SCM_DO_BUILD_DURING_DEPLOYMENT=1",
  "SCM_COMMAND_IDLE_TIMEOUT=1800",
  "NODE_ENV=production",
  "WEBSITES_PORT=8080"
)
if ($BuildLocally) { $settings += "ENABLE_ORYX_BUILD=false" }
if ($KeyVaultName) { $settings += "KEY_VAULT_NAME=$KeyVaultName"; $settings += "USE_KEY_VAULT=true" }

# Enable verbose SCM logging for better error details
az webapp log config --resource-group $ResourceGroup --name $AppServiceName `
    --docker-container-logging filesystem --level verbose --only-show-errors --output none

az webapp config appsettings set --resource-group $ResourceGroup --name $AppServiceName `
  --settings $settings --only-show-errors --output none

# Health check / AlwaysOn
$hcFileContent = '{"healthCheckPath":"/health"}'
$hcFileContent | Out-File -FilePath $hcFile -Encoding ascii -Force
az webapp config set --resource-group $ResourceGroup --name $AppServiceName `
  --generic-configurations "@$hcFile" --only-show-errors --output none
az webapp config set --resource-group $ResourceGroup --name $AppServiceName `
  --always-on true --only-show-errors --output none

# Clear custom startup if present
$currentCmd = az webapp config show --resource-group $ResourceGroup --name $AppServiceName --query siteConfig.appCommandLine -o tsv
if ($currentCmd) {
  Write-Info "Clearing existing startup command..."
  az resource update --ids $siteId --set siteConfig.appCommandLine="" --only-show-errors --output none
}

# ---------- SELF-HEAL SCM & WARM ----------
Ensure-ScmCanZipDeploy -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName
$null = Wait-ForScm -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName -MaxSeconds 300

# Test connectivity before attempting deployment
Test-KuduConnectivity -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName

# ---------- IMPROVED ZIPDEPLOY (Azure CLI first, then fallback) ----------
$deploymentSuccess = $false

try {
    Write-Info "Attempting Azure CLI ZIP deploy first (most reliable)..."
    az webapp deployment source config-zip `
        --resource-group $ResourceGroup `
        --name $AppServiceName `
        --src $zipPath `
        --timeout $UploadTimeoutSec
    Write-Ok "Azure CLI ZIP deploy succeeded."
    $deploymentSuccess = $true
} catch {
    Write-Warn "Azure CLI deploy failed: $($_.Exception.Message)"
    Write-Info "Falling back to direct Kudu API..."
    
    try {
        Invoke-KuduZipDeploy -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName -ZipPath $zipPath -Async -TimeoutSec $UploadTimeoutSec
        $deploymentSuccess = $true
    } catch {
        Write-Warn "Kudu zipdeploy async failed: $($_.Exception.Message)"
        Write-Info "Final attempt with synchronous zipdeploy..."
        try {
            Invoke-KuduZipDeploy -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName -ZipPath $zipPath -TimeoutSec $UploadTimeoutSec
            $deploymentSuccess = $true
        } catch {
            Write-Err "All deployment methods failed: $($_.Exception.Message)"
            throw "Deployment failed after trying all methods."
        }
    }
}

# ---------- POLL RESULT (only if using Kudu API) ----------
if ($deploymentSuccess -and $MyInvocation.Line -like "*Kudu*") {
    if (-not (Wait-ForKuduDeployment -ResourceGroup $ResourceGroup -AppServiceName $AppServiceName -TimeoutSec 1800)) {
        throw "Deployment failed or timed out per Kudu. Logs printed above."
    }
}

Write-Ok "Deployment completed."

# ---------- LOGS & CLEANUP ----------
az webapp log config --resource-group $ResourceGroup --name $AppServiceName `
  --application-logging filesystem --level information --only-show-errors --output none

Remove-Item $stage -Recurse -Force -ErrorAction Ignore
Remove-Item $zipPath -Force -ErrorAction Ignore
Remove-Item $hcFile -Force -ErrorAction Ignore

Write-Host ""
Write-Host ("Site:   https://{0}.azurewebsites.net/" -f $AppServiceName)
Write-Host ("Health: https://{0}.azurewebsites.net/health" -f $AppServiceName)
Write-Host ""
Write-Info "Tailing logs - Ctrl+C to stop"
az webapp log tail --resource-group $ResourceGroup --name $AppServiceName