[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$WorkOrderNumber,
    [string]$WorkOrderTitle,
    [string]$WorkOrderId,
    [string]$Status,
    [string[]]$Requirement,
    [string[]]$Blueprint,
    [string[]]$ReferencedBlueprint,
    [string]$Branch,
    [string]$PullRequestUrl,
    [string]$ContextPath,
    [switch]$Reset
)

$ErrorActionPreference = 'Stop'

function Print-Usage {
    Write-Output "Usage:"
    Write-Output "  powershell -ExecutionPolicy Bypass -File .cursor/skills/software-factory/execution/scripts/update-context-index.ps1 ``
    -WorkOrderNumber <number> [-ContextPath <path>] [-Reset] ``
    [-WorkOrderTitle `"<title>`"] [-WorkOrderId <stable-id>] [-Status `"<status>`"] ``
    [-Requirement `"<title>|<id-or-url>`"]... ``
    [-Blueprint `"<title>|<id-or-url>`"]... ``
    [-ReferencedBlueprint `"<title>|<id-or-url>`"]... ``
    [-Branch `"<branch>`"] [-PullRequestUrl `"<url>`"]"
    Write-Output ""
    Write-Output "Behavior:"
    Write-Output "  - Creates context.md if it does not exist."
    Write-Output "  - Adds repeated requirement/blueprint values without duplicating exact lines."
    Write-Output "  - Updates Work Order, status, branch, and PR fields when those arguments are provided."
    Write-Output "  - With -Reset, rewrites context.md from the provided arguments."
}

if (-not $WorkOrderNumber) {
    Write-Error "Error: -WorkOrderNumber is required."
    Print-Usage
    exit 1
}

if (-not $ContextPath) {
    $ContextPath = ".sw-factory/$WorkOrderNumber/context.md"
}

$InitializedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

function Format-EntityLine {
    param([string]$Value)
    if ($Value -notmatch '\|') {
        Write-Error "Error: entity values must use `"<title>|<id-or-url>`": $Value"
        exit 1
    }
    $idx = $Value.IndexOf('|')
    $title = $Value.Substring(0, $idx)
    $id = $Value.Substring($idx + 1)
    if (-not $title -or -not $id -or $title -eq $id) {
        Write-Error "Error: entity values must use `"<title>|<id-or-url>`": $Value"
        exit 1
    }
    $bt = [char]96
    return "- $title ($bt$id$bt)"
}

function Print-EntitiesOrPlaceholder {
    param([string]$Placeholder, [string[]]$Values)
    if (-not $Values -or $Values.Count -eq 0) {
        return @($Placeholder)
    }
    $lines = @()
    foreach ($v in $Values) { $lines += (Format-EntityLine -Value $v) }
    return $lines
}

function Get-Label {
    param([string]$n)
    if ($n -notlike 'WO-*') { return "WO-$n" }
    return $n
}

function Render-Context {
    $renderedTitle = if ($WorkOrderTitle) { $WorkOrderTitle } else { '{{WORK_ORDER_TITLE}}' }
    $renderedId    = if ($WorkOrderId)    { $WorkOrderId }    else { '{{WORK_ORDER_ID}}' }
    $label         = Get-Label -n $WorkOrderNumber
    $bt = [char]96

    $lines = @()
    $lines += "# Work Order Entity Index: $label"
    $lines += ""
    $lines += "**Initialized At (UTC):** $InitializedAt"
    $lines += "**Current Status:** $Status"
    $lines += ""
    $lines += "## Work Order"
    $lines += ""
    $lines += "- ${label}: ${renderedTitle} ($bt${renderedId}$bt)"
    $lines += ""
    $lines += "## Requirements"
    $lines += ""
    $lines += (Print-EntitiesOrPlaceholder -Placeholder '- {{REQUIREMENTS_DOCUMENT_TITLE}} ($bt{{REQUIREMENTS_DOCUMENT_ID}}$bt)' -Values $Requirement)
    $lines += ""
    $lines += "## Blueprints"
    $lines += ""
    $lines += (Print-EntitiesOrPlaceholder -Placeholder '- {{BLUEPRINT_DOCUMENT_TITLE}} ($bt{{BLUEPRINT_DOCUMENT_ID}}$bt)' -Values $Blueprint)
    $lines += ""
    $lines += "## Referenced Blueprints"
    $lines += ""
    $lines += "Blueprints reached through ``@...`` mentions and links while reading linked blueprints."
    $lines += ""
    $lines += (Print-EntitiesOrPlaceholder -Placeholder '- {{REFERENCED_BLUEPRINT_DOCUMENT_TITLE}} ($bt{{REFERENCED_BLUEPRINT_DOCUMENT_ID}}$bt)' -Values $ReferencedBlueprint)
    $lines += ""
    $lines += "## Delivery"
    $lines += ""
    $lines += "- Branch: $Branch"
    $lines += "- Pull Request URL: $PullRequestUrl"
    return $lines
}

function Replace-PrefixedLine {
    param([string[]]$Lines, [string]$Prefix, [string]$Value)
    $out = @()
    foreach ($l in $Lines) {
        if ($l.StartsWith($Prefix)) { $out += "$Prefix $Value" }
        else { $out += $l }
    }
    return $out
}

function Remove-PlaceholderLines {
    param([string[]]$Lines)
    $out = @()
    foreach ($l in $Lines) {
        if ($l -match '\{\{REQUIREMENTS_DOCUMENT_TITLE\}\}') { continue }
        if ($l -match '\{\{BLUEPRINT_DOCUMENT_TITLE\}\}')    { continue }
        if ($l -match '\{\{REFERENCED_BLUEPRINT_DOCUMENT_TITLE\}\}') { continue }
        $out += $l
    }
    return $out
}

function Replace-WorkOrderSection {
    param([string[]]$Lines, [string]$NewLine)
    $out = @()
    $inSection = $false
    $inserted = $false
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $l = $Lines[$i]
        if ($l -eq "## Work Order") {
            $out += $l
            $out += ""
            $out += $NewLine
            $inSection = $true
            $inserted = $true
            continue
        }
        if ($inSection -and $l -match '^## ') {
            $inSection = $false
            $out += ""
            $out += $l
            continue
        }
        if ($inSection) { continue }
        $out += $l
    }
    return $out
}

function Ensure-LineInSection {
    param([string[]]$Lines, [string]$Section, [string]$Line)
    $header = "## $Section"
    # If the exact line already exists anywhere, no-op
    $already = $false
    foreach ($l in $Lines) { if ($l -eq $Line) { $already = $true; break } }
    if ($already) { return $Lines }

    $out = @()
    $inSection = $false
    $inserted = $false
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $l = $Lines[$i]
        if ($l -eq $header) {
            $out += $l
            $inSection = $true
            continue
        }
        if ($inSection -and $l -match '^## ') {
            # Insert before leaving the section
            $out += ""
            $out += $Line
            $inserted = $true
            $inSection = $false
            $out += $l
            continue
        }
        $out += $l
    }
    if ($inSection -and -not $inserted) {
        $out += ""
        $out += $Line
    }
    return $out
}

function Normalize-Spacing {
    param([string[]]$Lines)
    # Collapse consecutive blank lines; ensure a blank line before ## headers (except at top).
    $out = @()
    $prevBlank = $false
    $prevListItem = $false
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $l = $Lines[$i]
        if ($l -match '^## ') {
            if ($out.Count -gt 0 -and -not $prevBlank) { $out += "" }
            $out += $l
            $prevBlank = $false
            $prevListItem = $false
            continue
        }
        if ([string]::IsNullOrWhiteSpace($l)) {
            if (-not $prevBlank) { $out += "" }
            $prevBlank = $true
            $prevListItem = $false
            continue
        }
        $out += $l
        $prevBlank = $false
        $prevListItem = ($l -match '^- ')
    }
    return $out
}

# Main
$dir = Split-Path -Parent $ContextPath
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

if ($Reset -or -not (Test-Path $ContextPath)) {
    $rendered = Render-Context
    $parent = Split-Path -Parent $ContextPath
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [System.IO.File]::WriteAllLines($ContextPath, $rendered, [System.Text.UTF8Encoding]::new($false))
    Write-Output "Context index written: $ContextPath"
    exit 0
}

$Lines = [System.IO.File]::ReadAllLines($ContextPath, [System.Text.UTF8Encoding]::new($false))

$Lines = Remove-PlaceholderLines -Lines $Lines

if ($Status) {
    $Lines = Replace-PrefixedLine -Lines $Lines -Prefix '**Current Status:**' -Value $Status
}

if ($WorkOrderTitle -or $WorkOrderId) {
    $title = if ($WorkOrderTitle) { $WorkOrderTitle } else { '{{WORK_ORDER_TITLE}}' }
    $id    = if ($WorkOrderId)    { $WorkOrderId }    else { '{{WORK_ORDER_ID}}' }
    $label = Get-Label -n $WorkOrderNumber
    $bt = [char]96
    $Lines = Replace-WorkOrderSection -Lines $Lines -NewLine "- ${label}: ${title} ($bt${id}$bt)"
}

if ($Branch) {
    $Lines = Replace-PrefixedLine -Lines $Lines -Prefix '- Branch:' -Value $Branch
}
if ($PullRequestUrl) {
    $Lines = Replace-PrefixedLine -Lines $Lines -Prefix '- Pull Request URL:' -Value $PullRequestUrl
}

foreach ($r in $Requirement) {
    if (-not $r) { continue }
    $Lines = Ensure-LineInSection -Lines $Lines -Section 'Requirements' -Line (Format-EntityLine -Value $r)
}
foreach ($b in $Blueprint) {
    if (-not $b) { continue }
    $Lines = Ensure-LineInSection -Lines $Lines -Section 'Blueprints' -Line (Format-EntityLine -Value $b)
}
foreach ($rb in $ReferencedBlueprint) {
    if (-not $rb) { continue }
    $Lines = Ensure-LineInSection -Lines $Lines -Section 'Referenced Blueprints' -Line (Format-EntityLine -Value $rb)
}

$Lines = Normalize-Spacing -Lines $Lines

[System.IO.File]::WriteAllLines($ContextPath, $Lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "Context index updated: $ContextPath"
