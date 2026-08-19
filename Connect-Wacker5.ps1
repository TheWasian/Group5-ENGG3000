[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$Ssid = 'Wacker5'
$WifiPassword = 'PasswordWacker123456!'
$Esp32Url = 'http://192.168.4.1/'
$GameUiPath = Join-Path $PSScriptRoot 'UI-Code\index.html'
$ConnectionTimeoutSeconds = 45
$tempProfilePath = $null

function Test-WifiProfileExists {
    param([Parameter(Mandatory)][string]$Name)

    & netsh.exe wlan show profile name="$Name" *> $null
    return $LASTEXITCODE -eq 0
}

function Add-TemporaryWifiProfile {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Password
    )

    $escapedName = [System.Security.SecurityElement]::Escape($Name)
    $escapedPassword = [System.Security.SecurityElement]::Escape($Password)
    $profileXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>$escapedName</name>
    <SSIDConfig>
        <SSID>
            <name>$escapedName</name>
        </SSID>
        <nonBroadcast>false</nonBroadcast>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>manual</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>$escapedPassword</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>
"@

    $path = Join-Path ([System.IO.Path]::GetTempPath()) ("Wacker5-{0}.xml" -f [guid]::NewGuid())
    [System.IO.File]::WriteAllText(
        $path,
        $profileXml,
        [System.Text.UTF8Encoding]::new($false)
    )

    try {
        Write-Host "Creating a Windows Wi-Fi profile for $Name..."
        & netsh.exe wlan add profile filename="$path" user=current | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Windows could not import the Wi-Fi profile."
        }
    }
    catch {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        throw
    }

    return $path
}

try {
    Write-Host "Checking for a saved $Ssid Wi-Fi profile..."

    if (Test-WifiProfileExists -Name $Ssid) {
        Write-Host "A saved $Ssid profile was found."
    }
    else {
        Write-Host "No saved $Ssid profile was found."
        $tempProfilePath = Add-TemporaryWifiProfile -Name $Ssid -Password $WifiPassword
    }

    Write-Host "Requesting connection to $Ssid..."
    & netsh.exe wlan connect name="$Ssid" ssid="$Ssid" | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Windows could not request a connection to $Ssid."
    }

    Write-Host "Waiting for the ESP32 at $Esp32Url..."
    $deadline = [DateTime]::UtcNow.AddSeconds($ConnectionTimeoutSeconds)
    $esp32Ready = $false

    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Esp32Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                $esp32Ready = $true
                break
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $esp32Ready) {
        throw "The ESP32 did not respond within $ConnectionTimeoutSeconds seconds. Check that it is powered on and that the saved password is correct."
    }

    Write-Host "Connected successfully. The ESP32 is responding at $Esp32Url" -ForegroundColor Green

    if (-not (Test-Path -LiteralPath $GameUiPath -PathType Leaf)) {
        throw "The game UI was not found at $GameUiPath"
    }

    Write-Host "Opening the game UI..."
    Start-Process -FilePath $GameUiPath
}
catch {
    Write-Host "Connection failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($tempProfilePath -and (Test-Path -LiteralPath $tempProfilePath)) {
        Remove-Item -LiteralPath $tempProfilePath -Force
        Write-Host "Deleted the temporary Wi-Fi profile file."
    }
}
