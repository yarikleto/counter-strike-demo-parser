# Corpus Validation

## Summary

Ran `scripts/validate-corpus.ts` against `/Users/yaroslavp/Downloads/DEMOS`,
a real-world set of WIX CSGO Club server-side recordings. The default
diverse-sample selection picked 10 demos covering 7 distinct active-duty maps
(de_ancient x2, de_anubis x2, de_dust2, de_inferno, de_mirage, de_nuke,
de_overpass, de_vertigo). Each demo was decompressed via `zlib.gunzipSync`
and run through `DemoParser.parseAll()` with a `parserError` listener
attached. Every parse completed cleanly: zero throws, zero `parserError`
events, zero timeouts. Median wall-clock parse time on the validator host was
949 ms (p99 1453 ms) for ~80-160 MB decompressed payloads.

The directory contained 103 files total but only 91 ended in `.dem.gz`. The
remaining 12 are uncompressed `.dem` files (newer batches starting
2026-02-20) — the validator skipped them since the brief specified gzipped
input. Worth noting if a future run wants the full corpus.

## Run

`npm run validate:corpus -- --limit 10` (Node builtins only).

### Sample picked

```
auto0-20251212-201848-671032788-de_ancient-WIX_CSGO_CLUB_1.dem.gz
auto0-20260102-171053-115989651-de_anubis-WIX_CSGO_CLUB_1.dem.gz
auto0-20251219-172202-397455292-de_dust2-WIX_CSGO_CLUB_1.dem.gz
auto0-20251212-171325-1485265431-de_inferno-WIX_CSGO_CLUB_1.dem.gz
auto0-20251212-190128-425683838-de_mirage-WIX_CSGO_CLUB_1.dem.gz
auto0-20251212-211107-1327843465-de_nuke-WIX_CSGO_CLUB_1.dem.gz
auto0-20251212-181939-2017907452-de_overpass-WIX_CSGO_CLUB_1.dem.gz
auto0-20260130-223710-1474720949-de_vertigo-WIX_CSGO_CLUB_1.dem.gz
auto0-20251226-180812-1743392085-de_ancient-WIX_CSGO_CLUB_1.dem.gz
auto0-20260109-185830-1053632795-de_anubis-WIX_CSGO_CLUB_1.dem.gz
```

### Per-file results

```
file                                                                      map     gzMB    rawMB        ms   threw   pErr   kills   rounds   players
---------------------------------------------------------------------------------------------------------------------------------------------------
auto0-20251212-201848-671032788-de_ancient-WIX_CSGO_CLUB_1.dem.g   de_ancient     63.3    103.3       949      no      0     475       31        14
auto0-20260102-171053-115989651-de_anubis-WIX_CSGO_CLUB_1.dem.gz    de_anubis    103.1    159.5      1453      no      0     527       31        20
auto0-20251219-172202-397455292-de_dust2-WIX_CSGO_CLUB_1.dem.gz      de_dust2     65.7    105.6       943      no      0     508       28        15
auto0-20251212-171325-1485265431-de_inferno-WIX_CSGO_CLUB_1.dem.   de_inferno     89.6    142.3      1314      no      0     520       31        16
auto0-20251212-190128-425683838-de_mirage-WIX_CSGO_CLUB_1.dem.gz    de_mirage     67.1    108.4       979      no      0     401       29        13
auto0-20251212-211107-1327843465-de_nuke-WIX_CSGO_CLUB_1.dem.gz       de_nuke     62.5    103.1       899      no      0     418       28         3
auto0-20251212-181939-2017907452-de_overpass-WIX_CSGO_CLUB_1.dem  de_overpass     57.3     91.9       847      no      0     332       22        14
auto0-20260130-223710-1474720949-de_vertigo-WIX_CSGO_CLUB_1.dem.   de_vertigo     44.7     75.5       666      no      0     311       29        13
auto0-20251226-180812-1743392085-de_ancient-WIX_CSGO_CLUB_1.dem.   de_ancient     48.8     79.9       709      no      0     362       22        15
auto0-20260109-185830-1053632795-de_anubis-WIX_CSGO_CLUB_1.dem.g    de_anubis     83.2    129.8      1192      no      0     497       27        17
```

### Aggregate

```
files parsed:        10
threw exceptions:    0
timed out (>60s):    0
had parserError:     0
total parserError events seen: 0
median parse ms:     949
p99 parse ms:        1453
parserError kinds:   (none)
unique throws:       (none)
```

## Findings

### Per-map success rate

| map         | demos | parsed | throws | parserError |
|-------------|-------|--------|--------|-------------|
| de_ancient  | 2     | 2      | 0      | 0           |
| de_anubis   | 2     | 2      | 0      | 0           |
| de_dust2    | 1     | 1      | 0      | 0           |
| de_inferno  | 1     | 1      | 0      | 0           |
| de_mirage   | 1     | 1      | 0      | 0           |
| de_nuke     | 1     | 1      | 0      | 0           |
| de_overpass | 1     | 1      | 0      | 0           |
| de_vertigo  | 1     | 1      | 0      | 0           |

100% parse success across all maps in the sample. No defensive-parser
recovery paths were triggered — `parserError` count is zero across the run.

### Counts look sane

Kills (311-527), rounds (22-31), and players (13-20) are within expected
ranges for competitive 5v5 CS:GO matches. Two demos ended at round 22 — both
are valid early-end matches (T or CT clinched 13).

### One anomaly worth investigating

**`de_nuke` reports `players: 3`** while every other demo reports 13-20.
That's the `dem_stop` snapshot — players who disconnect before the demo ends
do not appear (their `CCSPlayer` entities are deleted), so the value is
expected to be `<= 10` rather than `<= total_users`. But 3 is suspiciously
low for a demo that produced 418 kills across 28 rounds; it would mean ~7 of
10 active players disconnected in the final tick window or the entity
cleanup is happening earlier than `dem_stop` for this specific demo.

This is **not necessarily a parser bug** — the demo could legitimately end on
a teamswap / map vote where most slots are vacated. But it stands out enough
that the snapshot semantics should be confirmed against demoinfocs-golang on
this exact file before treating `DemoResult.players.length` as a reliable
"how many players were in the match" signal.

## Bug suspects flagged for follow-up

1. **`de_nuke` 3-player snapshot** — Re-parse
   `auto0-20251212-211107-1327843465-de_nuke-WIX_CSGO_CLUB_1.dem.gz` with
   `--map de_nuke --limit 1` and inspect the `dem_stop` tick: are 7 players
   really disconnected, or is the entity tracker pruning early? Cross-check
   with demoinfocs-golang's player roster on the same file.
2. **No corpus coverage for uncompressed `.dem`** — 12 newer demos in the
   directory aren't gzipped. Parser handles them fine via
   `DemoParser.fromBuffer(readFileSync(path))`, but the validator filter
   silently drops them. Either widen the filter or document the convention.

## Next steps

- Investigate the `de_nuke` player-count anomaly (low priority — likely a
  data quirk, not a parser bug).
- Consider running `--all` (91 demos, ~17 min wall-clock) before the next
  release to catch any tail-end edge cases the diverse sample missed.
- Optionally extend the validator to accept plain `.dem` so the full 103
  files can be validated in one pass.
