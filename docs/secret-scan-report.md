# Secret Scan Report

Run on: 2026-06-14 (final).

Result: PASS.

The scanner looks for:

- AWS access keys (`AKIA...`)
- GitHub tokens (`ghp_...`)
- An eth-style private key assigned to a secret-looking name
  (e.g. `PHAROS_DEPLOYER_PRIVATE_KEY = 0x...`).

Test files, vendored libraries, and the `deployments/` folder
(sanitized manifests) are ignored because they contain deterministic
hex addresses, not secrets. No leaked secrets were detected. The scan
can be re-run with `node scripts/secret-scan.mjs`.