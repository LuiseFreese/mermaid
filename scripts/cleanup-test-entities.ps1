# Cleanup Test Entities Script
# Removes old test entities and their relationships from Dataverse
# Handles dependencies by deleting relationships first, then entities

param (
    [string]$serverUrl = "http://localhost:3000",
    [string]$outputDirectory = "$PSScriptRoot\..\logs",
    [switch]$dryRun = $false,
    [switch]$interactive = $true,
    [string[]]$entityPrefixes = @(),  # Specific prefixes to clean up (optional)
    [switch]$cleanupAll = $false      # Clean up all test entities regardless of prefix
)

# Read environment variables from .env file
function Read-EnvFile {
    param (
        [string]$EnvFilePath
    )

    $envVars = @{}
    if (Test-Path $EnvFilePath) {
        Get-Content $EnvFilePath | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Remove quotes if they exist
                if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
                    $value = $matches[1]
                }
                $envVars[$key] = $value
            }
        }
    } else {
        Write-Host "⚠️ .env file not found at: $EnvFilePath" -ForegroundColor Yellow
    }
    return $envVars
}

# Create output directory if it doesn't exist
if (-not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    Write-Host "Created output directory at $outputDirectory"
}

# Load environment variables
$repoRoot = Split-Path -Parent $PSScriptRoot
$envVars = Read-EnvFile "$repoRoot\.env"
if ($envVars.Count -gt 0) {
    Write-Host "✅ Loaded $(($envVars.Keys).Count) environment variables from .env file" -ForegroundColor Green
} else {
    Write-Host "⚠️ No environment variables loaded from .env file" -ForegroundColor Yellow
}

Write-Host "`n🧹 Dataverse Test Entity Cleanup Script" -ForegroundColor Cyan
Write-Host "This script will:" -ForegroundColor Cyan
Write-Host "• Identify test entities with random prefixes" -ForegroundColor Yellow
Write-Host "• Delete relationships first (to resolve dependencies)" -ForegroundColor Yellow
Write-Host "• Delete custom test entities" -ForegroundColor Yellow
Write-Host "• Preserve CDM entities (Account, Contact, etc.)" -ForegroundColor Green

# Test if the server is running
try {
    $healthCheck = Invoke-RestMethod -Uri "$serverUrl/health" -Method Get
    Write-Host "`n✅ Server is running: $($healthCheck | ConvertTo-Json -Compress)"
} 
catch {
    Write-Host "`n❌ Server not reachable at $serverUrl. Make sure it's running." -ForegroundColor Red
    Write-Host "Error: $_"
    Write-Host "Press ENTER to exit..."
    Read-Host
    exit 1
}

# Determine cleanup mode
Write-Host "`n📋 Cleanup Mode:" -ForegroundColor Cyan
if ($dryRun) {
    Write-Host "RUNNING IN DRY RUN MODE - No entities will be deleted" -ForegroundColor Yellow
} else {
    Write-Host "⚠️ ACTUAL CLEANUP MODE - Entities and relationships will be permanently deleted" -ForegroundColor Red
    if ($interactive) {
        $confirm = Read-Host "Are you sure you want to continue with actual cleanup? (y/n)"
        if ($confirm -ne "y") {
            Write-Host "Cleanup cancelled." -ForegroundColor Yellow
            exit 0
        }
    }
}

# Create JSON payload for cleanup request
$cleanupPayload = @{
    "action" = "cleanup"
    "dryRun" = if ($dryRun) { $true } else { $false }
    "interactive" = $interactive
    "cleanupAll" = $cleanupAll
    "entityPrefixes" = $entityPrefixes
    "preserveCDM" = $true  # Always preserve CDM entities
    "deleteRelationshipsFirst" = $true  # Handle dependencies properly
}

# Add credentials from .env directly to the payload
if ($envVars.ContainsKey("DATAVERSE_URL")) { $cleanupPayload["dataverseUrl"] = $envVars["DATAVERSE_URL"] }
if ($envVars.ContainsKey("TENANT_ID")) { $cleanupPayload["tenantId"] = $envVars["TENANT_ID"] }
if ($envVars.ContainsKey("CLIENT_ID")) { $cleanupPayload["clientId"] = $envVars["CLIENT_ID"] }
if ($envVars.ContainsKey("CLIENT_SECRET")) { $cleanupPayload["clientSecret"] = $envVars["CLIENT_SECRET"] }

# Convert to JSON
$jsonPayload = $cleanupPayload | ConvertTo-Json -Compress

# Save the request body for debugging
$requestFile = Join-Path -Path $outputDirectory -ChildPath "cleanup-request-$(Get-Date -Format 'yyyy-MM-dd-HH-mm-ss').json"
$jsonPayload | Out-File -FilePath $requestFile
Write-Host "Saved cleanup request to $requestFile for debugging" -ForegroundColor Gray

# Send the cleanup request
Write-Host "`n🔄 Sending cleanup request..." -ForegroundColor Cyan
try {
    # Use Invoke-WebRequest to send JSON payload
    $webResponse = Invoke-WebRequest -Uri "$serverUrl/cleanup" -Method Post -Body $jsonPayload -ContentType "application/json"
    
    # Parse the response content
    $responseContent = $webResponse.Content
    
    # Save the entire response content for debugging
    $timestamp = Get-Date -Format 'yyyy-MM-dd-HH-mm-ss'
    $rawResponseFile = Join-Path -Path $outputDirectory -ChildPath "cleanup-raw-$timestamp.txt"
    [System.IO.File]::WriteAllText($rawResponseFile, $responseContent, [System.Text.Encoding]::UTF8)
    
    # Parse the response as JSON
    try {
        $response = $responseContent | ConvertFrom-Json
    } 
    catch {
        # For streaming responses, try to get the last complete JSON object
        Write-Host "Response appears to be a streaming response, extracting final result..." -ForegroundColor Gray
        
        $lastBrace = $responseContent.LastIndexOf('}')
        $lastOpen = $responseContent.LastIndexOf('{', $lastBrace)
        
        if ($lastOpen -ge 0 -and $lastBrace -gt $lastOpen) {
            $finalJson = $responseContent.Substring($lastOpen, $lastBrace - $lastOpen + 1)
            try {
                $response = $finalJson | ConvertFrom-Json
            } catch {
                Write-Host "⚠️ Could not parse final JSON response." -ForegroundColor Yellow
                Write-Host "Check the raw response file for details: $rawResponseFile" -ForegroundColor Yellow
                throw "Failed to parse server response as JSON"
            }
        } else {
            Write-Host "⚠️ Could not find a valid JSON object in the response." -ForegroundColor Yellow
            Write-Host "Check the raw response file for details: $rawResponseFile" -ForegroundColor Yellow
            throw "Failed to parse server response as JSON"
        }
    }
    
    Write-Host "✅ Cleanup request successful" -ForegroundColor Green
    
    # Display results based on response
    if ($dryRun) {
        Write-Host "`n📋 Dry Run Cleanup Results:" -ForegroundColor Yellow
        Write-Host "The following entities and relationships would be deleted:" -ForegroundColor Yellow
    } else {
        Write-Host "`n📋 Cleanup Results:" -ForegroundColor Green
    }
    
    # Show found entities
    if ($response.entitiesFound -and $response.entitiesFound.Count -gt 0) {
        Write-Host "`nTest entities found:" -ForegroundColor Cyan
        foreach ($entity in $response.entitiesFound) {
            $prefix = if ($entity.prefix) { $entity.prefix } else { "unknown" }
            Write-Host "  • $($entity.name) (prefix: $prefix, logical: $($entity.logicalName))" -ForegroundColor White
        }
    } else {
        Write-Host "`n✅ No test entities found to clean up" -ForegroundColor Green
    }
    
    # Show found relationships
    if ($response.relationshipsFound -and $response.relationshipsFound.Count -gt 0) {
        Write-Host "`nRelationships found:" -ForegroundColor Cyan
        foreach ($rel in $response.relationshipsFound) {
            Write-Host "  • $($rel.name) ($($rel.fromEntity) → $($rel.toEntity))" -ForegroundColor White
        }
    }
    
    # Show deletion results
    if ($response.relationshipsDeleted -gt 0) {
        Write-Host "`n🗑️ Relationships deleted: $($response.relationshipsDeleted)" -ForegroundColor Green
    }
    
    if ($response.entitiesDeleted -gt 0) {
        Write-Host "🗑️ Entities deleted: $($response.entitiesDeleted)" -ForegroundColor Green
    }
    
    if ($response.errors -and $response.errors.Count -gt 0) {
        Write-Host "`n⚠️ Errors encountered:" -ForegroundColor Red
        foreach ($err in $response.errors) {
            Write-Host "  • $err" -ForegroundColor Red
        }
    }
    
    if ($response.warnings -and $response.warnings.Count -gt 0) {
        Write-Host "`n⚠️ Warnings:" -ForegroundColor Yellow
        foreach ($warning in $response.warnings) {
            Write-Host "  • $warning" -ForegroundColor Yellow
        }
    }
    
    # Summary message
    if ($response.summary) {
        Write-Host "`n📋 Summary: $($response.summary)" -ForegroundColor Cyan
    }
    
    # Save the response for reference
    $responseFile = Join-Path -Path $outputDirectory -ChildPath "cleanup-response-$timestamp.json"
    $jsonResponse = ConvertTo-Json -InputObject $response -Depth 10 -Compress:$false
    [System.IO.File]::WriteAllText($responseFile, $jsonResponse, [System.Text.Encoding]::UTF8)
    
    Write-Host "`nFull response saved to $responseFile" -ForegroundColor Gray
    Write-Host "Raw response saved to $rawResponseFile" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Cleanup request failed" -ForegroundColor Red
    Write-Host "Error: $_"
    
    # Try to get more error details
    try {
        if ($_.Exception.Response) {
            $responseBody = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($responseBody)
            $responseContent = $reader.ReadToEnd()
            Write-Host "Response Content: $responseContent" -ForegroundColor Red
        }
    } catch {
        Write-Host "Could not read response details" -ForegroundColor Red
    }
    
    # Save error details to a file
    $errorFile = Join-Path -Path $outputDirectory -ChildPath "cleanup-error-$(Get-Date -Format 'yyyy-MM-dd-HH-mm-ss').txt"
    "Error during cleanup: $_" | Out-File -FilePath $errorFile
    Write-Host "Error details saved to $errorFile"
}

Write-Host "`n🏁 Cleanup script completed" -ForegroundColor Green
Write-Host "Check the logs directory for detailed results" -ForegroundColor Cyan
if ($interactive) {
    Write-Host "Press ENTER to exit..." -NoNewline
    Read-Host | Out-Null
}
