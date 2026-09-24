# Release Runbook

How a merged change reaches production, and what to check at each step.

## Deployment flow

```mermaid
flowchart LR
    A[Merge] --> B[Build and test]
    B --> C{Healthy?}
    C -->|yes| D[Promote]
    C -->|no| E[Roll back]
```

## Service ownership

| Service | Language | Rollback | Owner |
| --- | --- | --- | --- |
| alert-consumer | Go | rollout undo | Platform |
| wss-handler | Go | rollout undo | Realtime |
| ingest-agent | Go | delete and redeploy | Realtime |

## Release checklist

- [x] Path triggers verified against the import graph
- [x] Rollback path exercised on a first deploy
- [ ] Release notes reviewed by the owning team
- [ ] Dashboards checked one hour after promotion

## Sequence on failure

```mermaid
sequenceDiagram
    participant CI
    participant Cluster
    participant OnCall as On-call
    CI->>Cluster: Apply manifest
    Cluster-->>CI: Health check failed
    CI->>Cluster: Roll back to previous version
    CI->>OnCall: Page with the failing check
```
