# WO-1: Verify local infra services for RareCrest development
param(
  [string]$PostgresHost = "localhost",
  [int]$PostgresPort = 5432,
  [string]$MinioEndpoint = "http://localhost:9000",
  [string]$QdrantEndpoint = "http://localhost:6333"
)

$ErrorActionPreference = "Stop"
$failures = @()

function Test-HttpOk($url) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

Write-Host "Checking PostgreSQL on ${PostgresHost}:${PostgresPort}..."
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.Connect($PostgresHost, $PostgresPort)
  $tcp.Close()
  Write-Host "PASS: PostgreSQL port open"
} catch {
  $failures += "PostgreSQL unreachable on ${PostgresHost}:${PostgresPort}"
}

Write-Host "Checking MinIO health at $MinioEndpoint/minio/health/live..."
if (Test-HttpOk("$MinioEndpoint/minio/health/live")) {
  Write-Host "PASS: MinIO health"
} else {
  $failures += "MinIO health check failed"
}

Write-Host "Checking Qdrant health at $QdrantEndpoint/healthz..."
if (Test-HttpOk("$QdrantEndpoint/healthz")) {
  Write-Host "PASS: Qdrant health"
} else {
  $failures += "Qdrant health check failed"
}

if ($failures.Count -gt 0) {
  Write-Host "FAIL:"
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host "All infra checks passed."
exit 0
