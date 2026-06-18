# CertiK Skill Scanner

Every release of a response skill is scanned by CertiK before it can be
promoted. The scanner returns a verdict and a verdict hash. The hash is
recorded in `deployments/release-verdicts.json` so the audit trail is
verifiable.

## Local run

```bash
CERTIK_API_KEY=... node scripts/certik-scan.mjs
```

If `CERTIK_API_KEY` is not set, the script runs a deterministic offline
verdict and writes the result to the same file.
