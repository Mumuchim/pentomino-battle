# Replay Logging — Prompt 1 Implementation

## What was added

### New files
| Path | Purpose |
|---|---|
| `supabase/migrations/20260301000000_replay_logs.sql` | Schema migration — creates `pb_replay_logs`, adds `replay_id` to `pb_matches`, RLS policies, and `update_match_replay_id()` RPC |
| `src/lib/replayLogger.js` | Client-side recorder — accumulates move events and writes the replay row at match end |

### Modified files
| Path | Change |
|---|---|
| `src/App.vue` | Import + 3 watchers + gameover save block extension |

---

## Database schema

### `pb_replay_logs`
```
id           uuid PK
match_id     uuid FK → pb_matches.id (nullable, SET NULL on delete)
lobby_id     uuid (denormalised for fast lookup)
player1_id   text NOT NULL
player2_id   text NOT NULL
winner_id    text
end_reason   text  CHECK (normal|timeout|surrender|dodged|abandoned)
events       jsonb  -- ordered move array
final_board  jsonb  -- 2-D board at gameover
final_picks  jsonb  -- { "1": [...], "2": [...] }
metadata     jsonb  -- boardW, boardH, mode, round, allowFlip, startedAt
created_at   timestamptz
```

### `pb_matches` (added column)
```
replay_id    uuid FK → pb_replay_logs.id (nullable)
```

### `update_match_replay_id(p_match_id, p_replay_id)` RPC
Back-links a match row to its replay row. Uses `SECURITY DEFINER`; only sets the column when it's currently NULL (idempotent).

---

## Client flow

```
Match initialises (meta.players written by host)
  └─ watch([myPlayer, waitingForOpponent, lobbyId])
       └─ replayLogger.startReplay({ lobbyId, p1Id, p2Id, … })

Every authoritative move (game.lastMove changes)
  └─ watch(game.lastMove)
       └─ replayLogger.recordEvent(move)   ← deduplicates by seq

Game reaches "gameover" phase
  └─ gameover watcher (existing)
       ├─ sbRecordMatchResult(…)            ← existing
       └─ HOST ONLY:
            ├─ replayLogger.saveReplay(…)   → inserts pb_replay_logs row
            ├─ replayLogger.linkReplayToMatch(matchId, replayId)  → RPC
            └─ replayLogger.clearReplay()

Leaving the online screen / lobby disconnect
  └─ replayLogger.clearReplay()
```

**Both clients record events locally; only the host writes to Supabase.** This mirrors the existing `sbRecordMatchResult` deduplication pattern but skips it entirely — host-only avoids any race and guarantees exactly one replay row per match.

---

## Running the migration

```bash
# Supabase CLI
supabase db push

# Or directly in the Supabase SQL editor:
# paste the contents of supabase/migrations/20260301000000_replay_logs.sql
```

---

## Event schema (per element of `events` array)

```jsonc
// Draft pick
{ "seq": 3, "type": "draft", "player": 1, "piece": "T", "at": 1740000000000, "_ts": 4200 }

// Placement
{ "seq": 7, "type": "place", "player": 2, "piece": "L", "x": 3, "y": 1,
  "rotation": 1, "flipped": false, "at": 1740000010000, "_ts": 14200 }

// Timeout / surrender / dodge
{ "seq": 12, "type": "timeout", "player": 1, "at": 1740000020000, "_ts": 24200 }
```

`_ts` = milliseconds elapsed since `metadata.startedAt` — enables frame-accurate replay scrubbing in a future replay viewer UI.
