# HiTrack Modernization Progress - Phase 1 Complete

## Completed Fixes (Phase 1 - Data Correctness)

### Critical Data Integrity Bugs

#### ✅ BUG #1: Player Match Count Double-Counting
- **File**: [server/controllers/playerController.js](server/controllers/playerController.js#L490-L605)
- **Issue**: `rebuildAllPlayerStats()` incremented match count multiple times per player per match
  - Squad members counted once when added to squad
  - Then counted again when processing batting/bowling statistics
  - Result: Players who batted in both innings incorrectly had `matches=2+` instead of `1`
- **Fix**: Refactored to use `playerMatchParticipation` Map to track per-player per-match uniqueness
- **Validation**: 5 new regression tests added (server/test/playerStats.test.js)
- **Status**: Tests passing 118/118

#### ✅ BUG #2: Bowling Average Formula Errors
- **Files**: 
  - [server/controllers/matchController.js](server/controllers/matchController.js#L326)
  - [server/controllers/playerController.js](server/controllers/playerController.js#L181)
- **Issue**: Used `p.runs / p.wickets` (batting runs instead of runs conceded)
  - Cricket rule: Bowling average = RUNS_CONCEDED / WICKETS (never batting runs)
  - This affected: leaderboards, tournament standings, player rankings
- **Fix**: Changed to `p.runsConceded / p.wickets` with null-safety checks
- **Validation**: Existing tests confirm no regression
- **Status**: Verified in production code

#### ✅ BUG #3: Authentication Token Collision
- **Files**: 
  - [client/src/context/AuthContext.jsx](client/src/context/AuthContext.jsx)
  - [client/src/services/api.js](client/src/services/api.js)
  - [client/src/pages/admin/AdminSetup.jsx](client/src/pages/admin/AdminSetup.jsx)
- **Issue**: Single `cs_token` key could be overwritten by login from different role
  - User login overwrites admin token in localStorage
  - Admin JWT could be sent on user API calls (permission bypass risk)
- **Fix**: Separated into `cs_user_token` and `cs_admin_token` with mutual cleanup
- **Status**: Client builds successfully, no regressions

### Schema Enhancements (Backward-Compatible)

#### ✅ Match.resultData Field
- **File**: [server/models/Match.js](server/models/Match.js)
- **Purpose**: Structured match result (replaces English text parsing)
- **Schema**:
  ```javascript
  {
    type: "win" | "tie" | "no-result" | "abandoned",
    winnerTeamId: ObjectId,
    winnerTeamNameSnapshot: "Tigers",
    marginType: "runs" | "wickets" | "innings" | "super-over",
    marginValue: 6,
    method: "normal" | "super-over" | "DLS",
    decidedAt: Date
  }
  ```
- **Status**: Field added, migration script created (server/scripts/migrateResultData.js)
- **Next**: Run migration via `node server/scripts/migrateResultData.js` to backfill existing matches

#### ✅ Tournament.rulesConfig Field
- **File**: [server/models/other.js](server/models/other.js) (Tournament schema)
- **Purpose**: Structured tournament rules (replaces plain text rules string)
- **Schema**:
  ```javascript
  {
    innings: { overs, maxWickets },
    bowling: { maxOversPerBowler, allowConsecutiveOvers },
    points: { win, tie, noResult, loss },
    superOver: { enabled, repeatIfTied, maxWickets, overs },
    freeHit: { enabled },
    powerplay: { enabled }
  }
  ```
- **Default**: Safe fallback to standard T20 rules when null
- **Status**: Field added, utility created for safe access

#### ✅ Player RMC Rankings
- **File**: [server/models/Player.js](server/models/Player.js)
- **Purpose**: Support RMC format in rankings (t20, odi, rmc, test with Batting/Bowling/AllRounder variants)
- **Status**: Schema fields added (rmcBatting, rmcBowling, rmcAllRounder)

#### ✅ Match.teamAPlayingXI & Match.teamBPlayingXI
- **File**: [server/models/Match.js](server/models/Match.js)
- **Purpose**: Detailed roster structure with 11 playing players, substitutes, captain, keeper
- **Schema per team**:
  ```javascript
  {
    playingXI: ["player1", "player2", ...],  // 11 players
    substitutes: ["sub1", "sub2", ...],
    captainId: "id",
    captainName: "name",
    wicketKeeperId: "id", 
    wicketKeeperName: "name",
    selectedAt: Date
  }
  ```
- **Backward Compat**: Stored as null for existing matches, gracefully handled in queries
- **Status**: Schema added, validation pending in scoring controller

### New Utilities Created

#### ✅ server/utils/tournamentRules.js
Provides safe rule access with fallback to defaults:
- `getRulesForTournament(tournament)` - Get merged config
- `getMaxOvers(tournament)` - Get overs (default 20)
- `getMaxWickets(tournament)` - Get wickets (default 10)
- `getPointsFor(tournament, result)` - Points for win/tie/loss
- `isSuperOverEnabled(tournament)` - Check feature enabled
- `isFreeHitEnabled(tournament)` - Check feature enabled

#### ✅ server/utils/playerIdentity.js
Handles ID-to-name resolution with backward compatibility:
- `resolvePlayer(identifier, squad, repo)` - Find by ID or name
- `getActiveBatsmen(innings)` - Get current batting players
- `getCurrentBowler(innings)` - Get active bowler
- `isInPlayingXI(identifier, playingXI)` - Validate participation
- `validatePlayerParticipation(playerIdentifier, playingXI, type)` - Permission check
- Supports legacy matches without Playing XI structure

#### ✅ server/scripts/migrateResultData.js
Backfill script for existing matches:
- Parses existing `match.result` text strings
- Infers structured result data (type, winner, margin)
- Updates all completed matches without resultData
- Usage: `node server/scripts/migrateResultData.js`

### Test Coverage

#### ✅ New Regression Tests
- **File**: [server/test/playerStats.test.js](server/test/playerStats.test.js)
- **5 test cases**: 
  1. Single player, single match → matches = 1
  2. Player bats and bowls in same match → matches = 1 (not 2)
  3. Squad member who doesn't participate → matches = 0
  4. Multiple matches accumulate correctly
  5. No cross-player contamination
- **Status**: 118/118 passing

### Validation

✅ Server tests: 118 passed / 0 failed (686-726ms)
✅ Client build: Successful, 4 dist files, 0 errors/warnings (3.64s)
✅ No regressions: All existing functionality preserved
✅ Backward compatibility: Old data structures continue to work

---

## Phase 2: Playing XI & Match Roster (NEXT)

### Requirements
1. Update [server/controllers/liveScoringController.js](server/controllers/liveScoringController.js) to validate batsmen/bowlers against Playing XI
2. Calculate max wickets from `playingXI.length - 1` (not hardcoded 10)
3. Add Playing XI update endpoint to match routes
4. Migration: Backfill Playing XI from existing squad data for legacy matches
5. Validation: Ensure only Playing XI members can bat/bowl

### Expected Impact
- Prevents invalid player entries in scoring
- Accurate wicket limits per match
- Better match roster visibility

---

## Phase 3: Player ID Migration (CRITICAL)

### Requirements  
1. Migrate all scoring events to use `playerId` + `nameSnapshot`
2. Update match participants to use playerId references
3. Handle duplicate player names safely (fuzzy matching + user confirmation UI)
4. Scoring controller: Validate playerId exists before crediting runs/wickets
5. Statistics: Rebuild with playerId-based grouping (not name)

### Why Critical
- Names change (player re-entry, typos)
- Multiple players might share names
- Rankings require immutable player identity
- Current system can't distinguish "Smith v Smith"

---

## Phase 4: Free Hit State Management (IMPORTANT)

### Requirements
1. Track free hit flag in innings state
2. Update scoring events to capture free hit status
3. Controller: No wicket on free hit delivery
4. UI: Display "FREE HIT" indicator during scoring
5. Tests: Verify no wickets credited on free hit

### Impact
- Correct dismissal validation
- Accurate bowling statistics

---

## Phase 5: Tournament Rules Engine (HIGH)

### Requirements
1. Apply rulesConfig to all tournament operations
2. Points calculation: Use tournament.rulesConfig.points
3. Super Over: Check tournament.rulesConfig.superOver.enabled
4. Bowling overs: Check tournament.rulesConfig.bowling.maxOversPerBowler
5. Test: Multi-format tournament with different rules

### Expected Outcome
- Consistent, auditable rules application
- Support for custom tournament formats

---

## Known Limitations & Workarounds

### resultData Backfill
- Status: Script created, not yet run
- Workaround: Manually run `node server/scripts/migrateResultData.js` before using resultData fields
- Dry-run: Check before applying to production

### Playing XI Without Backfill
- Status: Schema added, legacy data compatibility pending
- Workaround: Existing matches continue to use squadA/squadB, new matches use Playing XI
- Migration: Planned for Phase 2

### Player ID Without Resolution
- Status: Utility created, not yet integrated
- Workaround: Use playerIdentity.resolvePlayer() in new endpoints
- Full integration: Planned for Phase 3

---

## Testing Recommendations

Before proceeding to Phase 2:

1. **Run resultData migration**:
   ```bash
   node server/scripts/migrateResultData.js
   ```

2. **Verify backfill**:
   ```javascript
   // Check sample match
   db.matches.findOne({status:"completed"}).resultData
   ```

3. **Test Playing XI structure**:
   - Create new match with teamAPlayingXI populated
   - Verify schema validation passes
   - Ensure backward compat with legacy matches

4. **Extend test coverage**:
   - Add tests for new utilities (tournamentRules, playerIdentity)
   - Add migration tests for resultData backfill

---

## Files Modified in Phase 1

1. [server/controllers/playerController.js](server/controllers/playerController.js) - Fix double-count
2. [server/controllers/matchController.js](server/controllers/matchController.js) - Fix bowling average
3. [client/src/context/AuthContext.jsx](client/src/context/AuthContext.jsx) - Token separation
4. [client/src/services/api.js](client/src/services/api.js) - Token retrieval logic
5. [client/src/pages/admin/AdminSetup.jsx](client/src/pages/admin/AdminSetup.jsx) - Admin token key
6. [server/models/Match.js](server/models/Match.js) - Add resultData, Playing XI fields
7. [server/models/Player.js](server/models/Player.js) - Add RMC rankings
8. [server/models/other.js](server/models/other.js) - Add rulesConfig to Tournament

## Files Created in Phase 1

1. [server/test/playerStats.test.js](server/test/playerStats.test.js) - Regression tests
2. [server/scripts/migrateResultData.js](server/scripts/migrateResultData.js) - Backfill script
3. [server/utils/tournamentRules.js](server/utils/tournamentRules.js) - Rules utility
4. [server/utils/playerIdentity.js](server/utils/playerIdentity.js) - Identity resolution

---

## Next Session TODO

- [ ] Run resultData migration: `node server/scripts/migrateResultData.js`
- [ ] Add Playing XI validation to [server/controllers/liveScoringController.js](server/controllers/liveScoringController.js)
- [ ] Create Playing XI CRUD endpoints in match routes
- [ ] Add tests for Playing XI participation validation
- [ ] Begin Phase 3: playerId migration in scoring events
