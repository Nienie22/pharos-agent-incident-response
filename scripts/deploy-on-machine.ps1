#requires -Version 5.1
<#
.SYNOPSIS
  Deploy Pharos incident response contracts to a Pharos Atlantic testnet from a local machine.

.DESCRIPTION
  1. Loads .env from the project root (does not print keys).
  2. Verifies RPC reachability, chain id, deployer balance.
  3. Builds contracts with forge.
  4. Runs forge script Deploy.s.sol --broadcast and captures tx hashes / addresses.
  5. Writes a JSON receipt file to deployments/atlantic.receipt.json (no private keys).
  6. Prints a short summary you can paste back into Codex.

.NOTES
  This script is safe to share. It never echoes private key material. The .env file
  is git-ignored. Run from a Windows PowerShell on a machine that can reach the
  Pharos Atlantic RPC.
#>

$ErrorActionPreference = "Stop"
$env:PATH = "C:\nodejs\node-v20.18.0-win-x64;C:\foundry;" + $env:PATH

$root = $PSScriptRoot
Set-Location $root

# 1. Load .env
$envMap = @{}
Get-Content .env | ForEach-Object {
  $line = $_
  if ($line -match '^\s*#' -or $line -match '^\s*$') { return }
  if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { return }
  $envMap[$Matches[1]] = $Matches[2].Trim().Trim('"')
}
foreach ($k in $envMap.Keys) { Set-Item -Path "Env:\$k" -Value $envMap[$k] }

Write-Host "[env] loaded $($envMap.Count) keys" -ForegroundColor Cyan
Write-Host "[env] RPC:        $($env:PHAROS_RPC_URL)"
Write-Host "[env] Chain:      $($env:PHAROS_CHAIN_ID)"
Write-Host "[env] Explorer:   $($env:PHAROS_EXPLORER_URL)"

# 2. Probe
$chain = cast chain-id --rpc-url $env:PHAROS_RPC_URL 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "[probe] FAIL: cannot reach RPC. Error: $chain" -ForegroundColor Red
  exit 1
}
Write-Host "[probe] chainId = $chain"
if ("$chain" -ne "$($env:PHAROS_CHAIN_ID)") {
  Write-Host "[probe] WARN: PHAROS_CHAIN_ID=$($env:PHAROS_CHAIN_ID) but RPC says $chain" -ForegroundColor Yellow
}

$deployer = cast wallet address --private-key $env:PHAROS_DEPLOYER_PRIVATE_KEY 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "[probe] FAIL: cannot decode deployer key. Check .env (no leading whitespace, starts with 0x)." -ForegroundColor Red
  exit 1
}
Write-Host "[probe] deployer = $deployer"

$bal = (cast balance --rpc-url $env:PHAROS_RPC_URL --ether $deployer 2>&1).Trim()
Write-Host "[probe] balance = $bal ether"
if ([double]$bal -lt 0.01) {
  Write-Host "[probe] WARN: balance is very low. Fund $deployer from the Pharos Atlantic faucet before continuing." -ForegroundColor Yellow
  $ans = Read-Host "Continue anyway? (y/n)"
  if ($ans -ne "y") { exit 1 }
}

$block0 = cast block-number --rpc-url $env:PHAROS_RPC_URL 2>&1
Write-Host "[probe] block    = $block0"

# 3. Build
Write-Host "[build] forge build" -ForegroundColor Cyan
Set-Location packages\contracts
$buildOut = forge build 2>&1
$buildOut | Select-Object -Last 20
if ($LASTEXITCODE -ne 0) {
  Write-Host "[build] FAIL" -ForegroundColor Red
  exit 1
}

# 4. Deploy
Write-Host "[deploy] forge script Deploy.s.sol --rpc-url --broadcast" -ForegroundColor Cyan
$script = "script/Deploy.s.sol"
$cmd = "forge script $script --rpc-url $env:PHAROS_RPC_URL --broadcast"
Write-Host "[deploy] $cmd"
$out = cmd.exe /c $cmd 2>&1
$out | Select-Object -Last 60
if ($LASTEXITCODE -ne 0) {
  Write-Host "[deploy] FAIL" -ForegroundColor Red
  $out | Out-File -Encoding utf8 deployments\last-deploy-error.log
  exit 1
}

# 5. Extract addresses + tx hashes from broadcast JSON
$latest = Get-ChildItem broadcast/Deploy.s.sol -Recurse -Filter "run-latest.json" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $latest) {
  Write-Host "[extract] cannot find broadcast/Deploy.s.sol/run-latest.json" -ForegroundColor Red
  exit 1
}
$latestPath = $latest.FullName
Write-Host "[extract] $latestPath"

$run = Get-Content $latestPath -Raw | ConvertFrom-Json
$txs = @()
foreach ($t in $run.transactions) {
  $txs += [pscustomobject]@{
    contractName = $t.contractName
    function     = $t.function
    transactionHash = $t.hash
    blockNumber   = $t.blockNumber
    from          = $t.from
    contractAddress = $t.contractAddress
  }
}

$receipt = [pscustomobject]@{
  network   = $env:PHAROS_EXPLORER_URL
  rpc       = $env:PHAROS_RPC_URL
  chainId   = $chain
  deployer  = $deployer
  balanceBefore = $bal
  blockStart = $block0
  timestamp = (Get-Date).ToString("o")
  broadcast = $latestPath
  transactions = $txs
}

Set-Location $root
New-Item -ItemType Directory -Path deployments -Force | Out-Null
$receiptPath = "deployments/atlantic.receipt.json"
$receipt | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $receiptPath
Write-Host "[extract] wrote $receiptPath"

# 6. Summary
Write-Host ""
Write-Host "==================== DEPLOY SUMMARY ====================" -ForegroundColor Green
foreach ($t in $txs) {
  $link = "$($env:PHAROS_EXPLORER_URL)/tx/$($t.transactionHash)"
  Write-Host ("  {0,-18} addr={1} block={2} tx={3}" -f $t.contractName, $t.contractAddress, $t.blockNumber, $t.transactionHash)
  Write-Host "    explorer: $link"
}
Write-Host "========================================================="
Write-Host "Paste the lines above (NOT the keys) back into Codex."
Write-Host "Receipt JSON: $receiptPath"