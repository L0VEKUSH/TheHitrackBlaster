# Live scoring checklist

- [x] Route the admin flat score payload through the authoritative scoring controller and engine
- [x] Normalize legacy extra names (`no-ball`, `leg-bye`) at the scoring boundary
- [x] Require idempotency keys and optimistic match versions for every scoring mutation
- [x] Return specific validation errors for invalid cricket actions
- [x] Run server/client tests and verify the authenticated `POST /api/matches/:id/score` flat payload no longer returns 400 "Action required"




