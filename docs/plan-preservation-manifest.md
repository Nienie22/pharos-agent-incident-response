# Plan Preservation Manifest

This file records the SHA-256 hashes of all protected source documents at the
moment the implementation work started. These files MUST NOT be modified for
the duration of the project. Any change to them will be treated as a violation
of the isolation and preservation contract.

## Protected files

| Path | SHA-256 | Size (bytes) |
|------|---------|--------------|
| README.md | `B77E67CE11790453CE9D04A71488AB64D10E92BC593EE12C86BA5B6836C8A13A` | 1173 |
| docs/superpowers/plans/2026-06-13-agent-incident-response-master-plan.md | `ED2EBADD0D89AB24F7830DA4ED9CA110F7C8A591C43C1484BA42724960DF0E25` | 8851 |

## Verification

A later `docs/plan-preservation-final-report.md` will be produced that
re-computes the SHA-256 hashes of the same files and compares them against
this manifest. A non-matching hash is treated as a failed preservation check.

## Notes

- No protected file was edited, renamed, or moved.
- All implementation artifacts live in new files that do not overlap with the
  protected documents.
