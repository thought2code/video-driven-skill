# Print the web UI URL from a .env file. VDS_DOMAIN set → https://<domain>/ ; else http://localhost/
param(
  [string]$EnvFile = ".env"
)

$domain = $null
if (Test-Path $EnvFile) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*VDS_DOMAIN\s*=\s*(.+)\s*$') {
      $domain = $Matches[1].Trim().Trim('"').Trim("'")
      break
    }
  }
}

if ($domain) {
  "https://$domain/"
} else {
  "http://localhost/"
}
