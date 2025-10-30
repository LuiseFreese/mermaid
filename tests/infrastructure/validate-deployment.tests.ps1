# Infrastructure Validation Tests
# Tests to validate Azure Bicep deployment and infrastructure health
# Run with: Invoke-Pester -Path .\tests\infrastructure\validate-deployment.tests.ps1

BeforeAll {
    # Test parameters (from environment variables)
    $script:AppName = if ($env:APP_NAME) { $env:APP_NAME } else { "app-mermaid-prod" }
    $script:ResourceGroup = if ($env:RESOURCE_GROUP) { $env:RESOURCE_GROUP } else { "rg-mermaid-prod" }
    $script:Location = if ($env:LOCATION) { $env:LOCATION } else { "westeurope" }
    
    Write-Host "Testing infrastructure for:" -ForegroundColor Cyan
    Write-Host "  App Name: $AppName" -ForegroundColor Gray
    Write-Host "  Resource Group: $ResourceGroup" -ForegroundColor Gray
    Write-Host "  Location: $Location" -ForegroundColor Gray
}

Describe "Azure Infrastructure Validation" {
    
    Context "Resource Group" {
        It "Resource group should exist" {
            $rg = az group show --name $ResourceGroup 2>$null | ConvertFrom-Json
            $rg | Should -Not -BeNullOrEmpty
            $rg.properties.provisioningState | Should -Be "Succeeded"
        }
        
        It "Resource group should be in correct location" {
            $rg = az group show --name $ResourceGroup | ConvertFrom-Json
            $rg.location | Should -Be $Location
        }
    }
    
    Context "App Service" {
        It "App Service should exist" {
            $app = az webapp show --name $AppName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json
            $app | Should -Not -BeNullOrEmpty
        }
        
        It "App Service should be running" {
            $app = az webapp show --name $AppName --resource-group $ResourceGroup | ConvertFrom-Json
            $app.state | Should -Be "Running"
        }
        
        It "App Service should use Linux" {
            $app = az webapp show --name $AppName --resource-group $ResourceGroup | ConvertFrom-Json
            $app.kind | Should -Match "linux"
        }
        
        It "App Service should use Node 20" {
            $app = az webapp show --name $AppName --resource-group $ResourceGroup | ConvertFrom-Json
            $app.siteConfig.linuxFxVersion | Should -Match "NODE\|20"
        }
        
        It "App Service should have HTTPS only enabled" {
            $app = az webapp show --name $AppName --resource-group $ResourceGroup | ConvertFrom-Json
            $app.httpsOnly | Should -Be $true
        }
    }
    
    Context "Managed Identity" {
        It "User-Assigned Managed Identity should be assigned" {
            $identity = az webapp identity show --name $AppName --resource-group $ResourceGroup 2>$null | ConvertFrom-Json
            $identity | Should -Not -BeNullOrEmpty
            $identity.type | Should -Match "UserAssigned"
        }
        
        It "Managed Identity should have client ID configured" {
            $identity = az webapp identity show --name $AppName --resource-group $ResourceGroup | ConvertFrom-Json
            $identity.userAssignedIdentities | Should -Not -BeNullOrEmpty
        }
    }
    
    Context "App Configuration" {
        It "Required environment variables should be set" {
            $settings = az webapp config appsettings list --name $AppName --resource-group $ResourceGroup | ConvertFrom-Json
            
            $requiredVars = @(
                "NODE_ENV",
                "USE_MANAGED_IDENTITY",
                "MANAGED_IDENTITY_CLIENT_ID",
                "TENANT_ID"
            )
            
            foreach ($var in $requiredVars) {
                $setting = $settings | Where-Object { $_.name -eq $var }
                $setting | Should -Not -BeNullOrEmpty -Because "$var should be configured"
            }
        }
        
        It "USE_MANAGED_IDENTITY should be true" {
            $settings = az webapp config appsettings list --name $AppName --resource-group $ResourceGroup | ConvertFrom-Json
            $setting = $settings | Where-Object { $_.name -eq "USE_MANAGED_IDENTITY" }
            $setting.value | Should -Be "true"
        }
    }
    
    Context "Application Health" {
        It "Health endpoint should return 200 OK" {
            $url = "https://$AppName.azurewebsites.net/health"
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
            $response.StatusCode | Should -Be 200
        }
        
        It "Health endpoint should return healthy status" {
            $url = "https://$AppName.azurewebsites.net/health"
            $response = Invoke-RestMethod -Uri $url -TimeoutSec 30
            $response.status | Should -Be "healthy"
        }
        
        It "Application should have version information" {
            $url = "https://$AppName.azurewebsites.net/health"
            $response = Invoke-RestMethod -Uri $url -TimeoutSec 30
            $response.version | Should -Not -BeNullOrEmpty
        }
    }
    
    Context "Multi-Environment Configuration" {
        It "Environments API should be accessible" {
            $url = "https://$AppName.azurewebsites.net/api/environments"
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
            $response.StatusCode | Should -Be 200
        }
        
        It "At least one environment should be configured" {
            $url = "https://$AppName.azurewebsites.net/api/environments"
            $response = Invoke-RestMethod -Uri $url -TimeoutSec 30
            $response.environments.Count | Should -BeGreaterThan 0
        }
        
        It "Default environment should be set" {
            $url = "https://$AppName.azurewebsites.net/api/environments"
            $response = Invoke-RestMethod -Uri $url -TimeoutSec 30
            $response.defaultEnvironmentId | Should -Not -BeNullOrEmpty
        }
    }
    
    Context "Deployment Validation" {
        It "App should serve frontend" {
            $url = "https://$AppName.azurewebsites.net/"
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
            $response.StatusCode | Should -Be 200
            $response.Content | Should -Match "<!DOCTYPE html>"
        }
        
        It "API endpoints should be accessible" {
            $url = "https://$AppName.azurewebsites.net/api/environments"
            { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 } | Should -Not -Throw
        }
    }
}

Describe "Performance Validation" {
    Context "Response Times" {
        It "Health endpoint should respond within 5 seconds" {
            $url = "https://$AppName.azurewebsites.net/health"
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
            $stopwatch.Stop()
            
            $response.StatusCode | Should -Be 200
            $stopwatch.ElapsedMilliseconds | Should -BeLessThan 5000
        }
        
        It "Environments API should respond within 10 seconds" {
            $url = "https://$AppName.azurewebsites.net/api/environments"
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
            $stopwatch.Stop()
            
            $response.StatusCode | Should -Be 200
            $stopwatch.ElapsedMilliseconds | Should -BeLessThan 10000
        }
    }
}
