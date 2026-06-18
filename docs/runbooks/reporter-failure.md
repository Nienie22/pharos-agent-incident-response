# Runbook — Reporter Failure

## Trigger
The watcher health check reports an outage (S8).

## Steps
1. The responder creates an `INFO` incident recording the outage window.
2. On resume, the watcher replays the missed blocks and emits any
   signals that were observed.
3. If the replay yields a HIGH+ signal, treat it as a fresh incident.
