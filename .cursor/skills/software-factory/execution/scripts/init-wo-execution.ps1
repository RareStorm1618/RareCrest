[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$WorkOrderNumber,
    [Parameter(Mandatory=$true)]
    [string]$WorkOrderTitle,
    [Parameter(Mandatory=$true)]
    [string]$WorkOrderId,
    [string]$OutputRoot = ".sw-factory"
)

$ErrorActionPreference = 'Stop'

function Print-Usage {
    Write-Output "Usage:"
    Write-Output "  powershell -ExecutionPolicy Bypass -File .cursor/skills/software-factory/execution/scripts/init-wo-execution.ps1 ``
    -WorkOrderNumber WO-XXX -WorkOrderTitle `"<title>`" -WorkOrderId <stable-id>"
    Write-Output ""
    Write-Output "Creates: .sw-factory/WO-XXX/"
    Write-Output "  - checklist.md"
    Write-Output "  - context.md"
    Write-Output "  - implementation-plan.md"
    Write-Output "  - review-log.md"
    Write-Output ""
    Write-Output "Safety:"
    Write-Output "  Fails if target files already exist to prevent accidental overwrite."
}

if ($WorkOrderNumber -eq "-h" -or $WorkOrderNumber -eq "--help") { Print-Usage; exit 0 }
if (-not $WorkOrderNumber -or -not $WorkOrderTitle -or -not $WorkOrderId) {
    Write-Error "Error: -WorkOrderNumber, -WorkOrderTitle, and -WorkOrderId are required."
    Print-Usage
    exit 1
}

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }

# Template -> output name pairs
$Templates = @(
    @{ Template = Join-Path $ScriptDir 'checklist-template.md';             Output = 'checklist.md' },
    @{ Template = Join-Path $ScriptDir 'context-template.md';               Output = 'context.md' },
    @{ Template = Join-Path $ScriptDir 'implementation-plan-template.md';   Output = 'implementation-plan.md' },
    @{ Template = Join-Path $ScriptDir 'review-log-template.md';            Output = 'review-log.md' }
)

foreach ($entry in $Templates) {
    if (-not (Test-Path $entry.Template)) {
        Write-Error "Error: template not found at $($entry.Template)"
        exit 1
    }
}

# Sanitize WO number for filesystem safety (allow only A-Za-z0-9._-; replace others with -)
$SafeWoNumber = [regex]::Replace($WorkOrderNumber, '[^A-Za-z0-9._-]', '-')
$OutputDir = Join-Path $OutputRoot $SafeWoNumber
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

$InitializedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Normalize label to WO-<n> form
$Label = $WorkOrderNumber
if ($Label -notlike 'WO-*') { $Label = "WO-$Label" }

function Apply-Substitutions {
    param([string]$TemplatePath, [string]$OutputPath,
          [string]$Number, [string]$Label, [string]$Title, [string]$Timestamp, [string]$Id)
    $content = [System.IO.File]::ReadAllText($TemplatePath, [System.Text.UTF8Encoding]::new($false))
    # Use placeholder tokens to avoid regex special-char issues in the values themselves.
    $content = $content -replace '\{\{WORK_ORDER_NUMBER\}\}', '§§NUM§§'
    $content = $content -replace '\{\{WORK_ORDER_LABEL\}\}', '§§LBL§§'
    $content = $content -replace '\{\{WORK_ORDER_TITLE\}\}', '§§TTL§§'
    $content = $content -replace '\{\{INITIALIZED_AT\}\}', '§§TS§§'
    $content = $content -replace '\{\{WORK_ORDER_ID\}\}', '§§ID§§'
    # Now literal-replace the placeholders with raw values (no regex interpretation).
    $content = $content.Replace('§§NUM§§', $Number).Replace('§§LBL§§', $Label).Replace('§§TTL§§', $Title).Replace('§§TS§§', $Timestamp).Replace('§§ID§§', $Id)
    [System.IO.File]::WriteAllText($OutputPath, $content, [System.Text.UTF8Encoding]::new($false))
}

# Pre-flight: refuse to overwrite existing artifacts
foreach ($entry in $Templates) {
    $outPath = Join-Path $OutputDir $entry.Output
    if (Test-Path $outPath) {
        Write-Error "Error: $outPath already exists. Refusing to overwrite existing execution artifacts."
        exit 1
    }
}

Write-Output "Work order directory initialized: $OutputDir/"
foreach ($entry in $Templates) {
    $outPath = Join-Path $OutputDir $entry.Output
    Apply-Substitutions -TemplatePath $entry.Template -OutputPath $outPath `
        -Number $WorkOrderNumber -Label $Label -Title $WorkOrderTitle `
        -Timestamp $InitializedAt -Id $WorkOrderId
    Write-Output "  - $($entry.Output)"
}
