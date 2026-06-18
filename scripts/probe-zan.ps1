#requires -Version 5.1
<#
.SYNOPSIS
  Probe the ZAN RPC endpoint for Pharos Atlantic from your local machine.

.DESCRIPTION
  This is a SAFE, key-free probe. It does not require your .env file and does
  not echo any secret. Paste the output back into Codex to confirm the chain
  id and a recent block number.
#>

$env:PATH = "C:\nodejs\node-v20.18.0-win-x64;C:\foundry;" + $env:PATH

$rpc = "https://api.zan.top/node/v1/pharos/atlantic/de8975f3cf0c499798a0b6a7b7131d2c"
$wss = "wss://api.zan.top/node/ws/v1/pharos/atlantic/de8975f3cf0c499798a0b6a7b7131d2c"

Write-Host "RPC: $rpc"
Write-Host "WSS: $wss"
Write-Host ""

Write-Host "--- chain id ---" -ForegroundColor Cyan
cast chain-id --rpc-url $rpc

Write-Host "--- block number ---" -ForegroundColor Cyan
cast block-number --rpc-url $rpc

Write-Host "--- client version ---" -ForegroundColor Cyan
cast client --rpc-url $rpc

Write-Host "--- net version ---" -ForegroundColor Cyan
cast call --rpc-url $rpc 0x0000000000000000000000000000000000000000 2>&1 | Select-Object -First 5