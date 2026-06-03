# TODO

- [x] Inspect `server/middleware/validation.js` scoring middleware contract
- [x] Update `validateScoreUpdate` to accept frontend payload shape (inningsNum/runs/isWicket/extraType/etc) while keeping backward compatibility for `{action,data}`
- [x] Ensure extraType naming compatibility (frontend: `noBall`, `legBye`; middleware: `no-ball`, `leg-bye`)

- [x] Add safe normalization and clearer 400 messages
- [ ] Re-run build/tests (server/client) and verify `POST /api/matches/:id/score` no longer returns 400 "Action required"




