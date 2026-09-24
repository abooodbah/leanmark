# Service Notes

Operational notes for the services listed in the release runbook.

## alert-consumer

Consumes detection events and fans alerts out to subscribers. A restart is
safe at any time; messages are acknowledged only after delivery.

## ingest-agent

Runs next to each sensor and forwards readings. Redeploy it rather than
rolling back, because its configuration is regenerated on start.
