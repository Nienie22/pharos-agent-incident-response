#requires -Version 5.1
<#
.SYNOPSIS
  Deploy Pharos incident response contracts to Pharos Atlantic via the ZAN RPC endpoint.

.DESCRIPTION
  Same flow as deploy-on-machine.ps1, but the RPC URL is hard-coded to the ZAN
  endpoint you provided. The ZAN API key is a public-allowing credential, NOT
  a wallet key, so it can be inlined.

  Steps:
    1. Probe ZAN RPC (chain id, block, balance, nonce).
    2. forge build the contracts.
    3. forge script Deploy.s.sol --rpc-url <ZAN> --broadcast
    4. Extract addresses, tx hashes, block numbers from
       broadcast/Deploy.s.sol/<chainId>/run-latest.json
    5. Write deployments/atlantic.receipt.json (NO private keys)
    6. Print a summary you can paste back into Codex.
#>

$ErrorActionPreference = "Stop"
$env:PATH = "C:\nodejs\node-v20.18.0-win-x64;C:\foundry;" + $env:PATH

$ZAN_RPC = "https://api.zan.top/node/v1/pharos/atlantic/de8975f3cf0c499798a0b6a7b7131d2c"
$ZAN_WSS = "wss://api.zan.top/node/ws/v1/pharos/atlantic/de8975f3cf0c499798a0b6a7b7131d2c"
$EXPLORER = "https://atlantic.pharosscan.com"
$root = $PSScriptRoot
Set-Location $root

# 1. Load .env (for private keys only). Strip whitespace defensively.
$envMap = @{}
Get-Content .env | ForEach-Object {
  $line = $_
  if ($line -match '^\s*#' -or $line -match '^\s*$') { return }
  if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { return }
  $envMap[$Matches[1]] = $Matches[2].Trim().Trim('"')
}
foreach ($k in $envMap.Keys) { Set-Item -Path "Env:\$k" -Value $envMap[$k] }

Write-Host "[env] loaded $($envMap.Count) keys" -ForegroundColor Cyan
Write-Host "[rpc] using ZAN endpoint"
Write-Host "[rpc] $ZAN_RPC"

# 2. Probe
$chain = cast chain-id --rpc-url $ZAN_RPC 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "[probe] FAIL: cannot reach ZAN RPC. Error: $chain" -ForegroundColor Red
  exit 1
}
Write-Host "[probe] chainId = $chain"
if ("$chain" -ne "$($env:PHAROS_CHAIN_ID)") {
  Write-Host "[probe] NOTE: PHAROS_CHAIN_ID=$($env:PHAROS_CHAIN_ID) but RPC says $chain" -ForegroundColor Yellow
}

$deployer = cast wallet address --private-key $env:PHAROS_DEPLOYER_PRIVATE_KEY 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "[probe] FAIL: cannot decode deployer key. Check .env (no leading whitespace, must start with 0x)." -ForegroundColor Red
  exit 1
}
Write-Host "[probe] deployer = $deployer"

$bal = (cast balance --rpc-url $ZAN_RPC --ether $deployer 2>&1).Trim()
Write-Host "[probe] balance = $bal ether"
if ([double]$bal -lt 0.01) {
  Write-Host "[probe] WARN: balance is very low. Fund $deployer from the Pharos Atlantic faucet before continuing." -ForegroundColor Yellow
  $ans = Read-Host "Continue anyway? (y/n)"
  if ($ans -ne "y") { exit 1 }
}

$nonce = cast nonce --rpc-url $ZAN_RPC $deployer 2>&1
Write-Host "[probe] nonce   = $nonce"
$block0 = cast block-number --rpc-url $ZAN_RPC 2>&1
Write-Host "[probe] block0  = $block0"

# 3. Build
Write-Host "[build] forge build (packages/contracts)" -ForegroundColor Cyan
Set-Location packages\contracts
$buildOut = forge build 2>&1
$buildOut | Select-Object -Last 20
if ($LASTEXITCODE -ne 0) {
  Write-Host "[build] FAIL" -ForegroundColor Red
  exit 1
}

# 4. Deploy
Write-Host "[deploy] forge script Deploy.s.sol --rpc-url ZAN --broadcast" -ForegroundColor Cyan
$script = "script/Deploy.s.sol"
$cmd = "forge script $script --rpc-url $ZAN_RPC --broadcast"
Write-Host "[deploy] $cmd"
$out = cmd.exe /c $cmd 2>&1
$out | Select-Object -Last 80
if ($LASTEXITCODE -ne 0) {
  Write-Host "[deploy] FAIL" -ForegroundColor Red
  $out | Out-File -Encoding utf8 deployments\last-deploy-error.log
  exit 1
}

# 5. Extract from broadcast/<chainId>/run-latest.json
$chainDir = "$chain"
$latest = Get-ChildItem "broadcast/Deploy.s.sol/$chainDir" -Filter "run-latest.json" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $latest) {
  Write-Host "[extract] cannot find broadcast/Deploy.s.sol/$chainDir/run-latest.json" -ForegroundColor Red
  Write-Host "[extract] content of broadcast/:" -ForegroundColor Yellow
  Get-ChildItem broadcast -Recurse -Name | Select-Object -First 30
  exit 1
}
$latestPath = $latest.FullName
Write-Host "[extract] $latestPath"

$run = Get-Content $latestPath -Raw | ConvertFrom-Json
$txs = @()
foreach ($t in $run.transactions) {
  $txs += [pscustomobject]@{
    contractName    = $t.contractName
    function        = $t.function
    transactionHash = $t.hash
    blockNumber     = $t.blockNumber
    from            = $t.from
    contractAddress = $t.contractAddress
  }
}

$receipt = [pscustomobject]@{
  network       = $EXPLORER
  rpc           = $ZAN_RPC
  rpcKind       = "zan"
  chainId       = $chain
  deployer      = $deployer
  balanceBefore = $bal
  blockStart    = $block0
  nonceStart    = $nonce
  timestamp     = (Get-Date).ToString("o")
  broadcast     = $latestPath
  transactions  = $txs
}

Set-Location $root
New-Item -ItemType Directory -Path deployments -Force | Out-Null
$receiptPath = "deployments/atlantic.receipt.json"
$receipt | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $receiptPath
Write-Host "[extract] wrote $receiptPath"

# 6. Summary
Write-Host ""
Write-Host "==================== DEPLOY SUMMARY ====================" -ForegroundColor Green
Write-Host ("chainId   = {0}" -f $chain)
Write-Host ("deployer  = {0}" -f $deployer)
Write-Host ("balance   = {0} ether" -f $bal)
Write-Host ("block0    = {0}" -f $block0)
Write-Host ("explorer  = {0}" -f $EXPLORER)
Write-Host ""
foreach ($t in $txs) {
  $link = "$EXPLORER/tx/$($t.transactionHash)"
  $addrLink = "$EXPLORER/address/$($t.contractAddress)"
  Write-Host ("  {0,-24} function={1,-20}" -f $t.contractName, $t.function) -ForegroundColor Cyan
  Write-Host ("    addr : {0}" -f $t.contractAddress)
  Write-Host ("    block: {0}" -f $t.blockNumber)
  Write-Host ("    tx   : {0}" -f $t.transactionHash)
  Write-Host ("    addr : {0}" -f $addrLink)
  Write-Host ("    tx   : {0}" -f $link)
}
Write-Host "========================================================="
Write-Host "Paste the lines above (NOT the keys) back into Codex."
Write-Host "Receipt JSON: $receiptPath"