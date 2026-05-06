// Cross-validation export tool: parses a CS demo with demoinfocs-golang and
// writes a JSON snapshot used to diff against our own parser's output.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	dem "github.com/markus-wa/demoinfocs-golang/v4/pkg/demoinfocs"
	events "github.com/markus-wa/demoinfocs-golang/v4/pkg/demoinfocs/events"
)

type headerOut struct {
	MapName       string  `json:"mapName"`
	PlaybackTicks int     `json:"playbackTicks"`
	PlaybackTime  float64 `json:"playbackTime"`
}

type killOut struct {
	Tick     int    `json:"tick"`
	Attacker string `json:"attacker"`
	Victim   string `json:"victim"`
	Weapon   string `json:"weapon"`
	Headshot bool   `json:"headshot"`
}

type roundOut struct {
	Index     int    `json:"index"`
	Winner    string `json:"winner"`
	EndReason string `json:"endReason"`
	ScoreCT   int    `json:"scoreCT"`
	ScoreT    int    `json:"scoreT"`
}

type summaryOut struct {
	KillsCount   int `json:"killsCount"`
	RoundsCount  int `json:"roundsCount"`
	PlayersCount int `json:"playersCount"`
}

type snapshot struct {
	Header  headerOut  `json:"header"`
	Kills   []killOut  `json:"kills"`
	Rounds  []roundOut `json:"rounds"`
	Summary summaryOut `json:"summary"`
}

// teamSide maps the demoinfocs Team enum to a short string. We collapse
// Spectators / Unassigned to their string forms so the consumer can see them
// rather than silently get "" — easier to spot bad rounds during diffing.
func teamSide(t int) string {
	// values from demoinfocs/common.Team: 0 Unassigned, 1 Spectators, 2 T, 3 CT
	switch t {
	case 2:
		return "T"
	case 3:
		return "CT"
	case 1:
		return "Spectators"
	default:
		return "Unassigned"
	}
}

// roundEndReason mirrors the events.RoundEndReason constants. We avoid pulling
// in a whole switch on every value — the strings only need to round-trip
// recognizably for diffing, so we lean on Stringer if available, fallback to
// numeric.
func roundEndReason(r events.RoundEndReason) string {
	// events.RoundEndReason has a String() via fmt.Stringer in newer versions.
	type stringer interface{ String() string }
	if s, ok := any(r).(stringer); ok {
		return s.String()
	}
	return fmt.Sprintf("%d", int(r))
}

func run() error {
	demoPath := "test/fixtures/de_nuke.dem"
	if len(os.Args) > 1 {
		demoPath = os.Args[1]
	}

	f, err := os.Open(demoPath)
	if err != nil {
		return fmt.Errorf("open demo: %w", err)
	}
	defer f.Close()

	p := dem.NewParser(f)
	defer p.Close()

	var (
		kills     []killOut
		rounds    []roundOut
		roundIdx  = 0
		playerIDs = map[uint64]struct{}{}
	)

	p.RegisterEventHandler(func(e events.Kill) {
		var attackerName, victimName, weaponName string
		if e.Killer != nil {
			attackerName = e.Killer.Name
		}
		if e.Victim != nil {
			victimName = e.Victim.Name
		}
		if e.Weapon != nil {
			weaponName = e.Weapon.String()
		}
		kills = append(kills, killOut{
			Tick:     p.GameState().IngameTick(),
			Attacker: attackerName,
			Victim:   victimName,
			Weapon:   weaponName,
			Headshot: e.IsHeadshot,
		})
	})

	p.RegisterEventHandler(func(e events.RoundEnd) {
		gs := p.GameState()
		ct := gs.TeamCounterTerrorists()
		t := gs.TeamTerrorists()
		var winner string
		if e.Winner != 0 {
			winner = teamSide(int(e.Winner))
		}
		scoreCT := 0
		scoreT := 0
		if ct != nil {
			scoreCT = ct.Score()
		}
		if t != nil {
			scoreT = t.Score()
		}
		rounds = append(rounds, roundOut{
			Index:     roundIdx,
			Winner:    winner,
			EndReason: roundEndReason(e.Reason),
			ScoreCT:   scoreCT,
			ScoreT:    scoreT,
		})
		roundIdx++
	})

	// Track unique players seen during the match.
	p.RegisterEventHandler(func(e events.PlayerConnect) {
		if e.Player != nil {
			playerIDs[e.Player.SteamID64] = struct{}{}
		}
	})

	if err := p.ParseToEnd(); err != nil {
		return fmt.Errorf("parse: %w", err)
	}

	// Some demos don't emit PlayerConnect for everyone (already-connected at
	// demo start). Sweep the final participant list to backfill.
	for _, pl := range p.GameState().Participants().All() {
		if pl == nil {
			continue
		}
		playerIDs[pl.SteamID64] = struct{}{}
	}

	hdr := p.Header()
	out := snapshot{
		Header: headerOut{
			MapName:       hdr.MapName,
			PlaybackTicks: hdr.PlaybackTicks,
			PlaybackTime:  hdr.PlaybackTime.Seconds(),
		},
		Kills:  kills,
		Rounds: rounds,
		Summary: summaryOut{
			KillsCount:   len(kills),
			RoundsCount:  len(rounds),
			PlayersCount: len(playerIDs),
		},
	}

	// Resolve project root: this binary lives at <root>/scripts/demoinfocs-export.
	exe, err := os.Executable()
	_ = exe
	if err != nil {
		// fall through, we'll use cwd-based fallback
	}
	// Prefer the source-file based root: we know main.go is in scripts/demoinfocs-export.
	wd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("getwd: %w", err)
	}
	// If invoked via `go run .` from scripts/demoinfocs-export, wd is that dir.
	// Walk up until we find a sibling 'bench' or 'package.json' as a hint.
	root := wd
	for i := 0; i < 6; i++ {
		if _, err := os.Stat(filepath.Join(root, "package.json")); err == nil {
			break
		}
		parent := filepath.Dir(root)
		if parent == root {
			break
		}
		root = parent
	}

	benchDir := filepath.Join(root, "bench")
	if err := os.MkdirAll(benchDir, 0o755); err != nil {
		return fmt.Errorf("mkdir bench: %w", err)
	}
	outPath := filepath.Join(benchDir, "demoinfocs-export.json")

	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	if err := os.WriteFile(outPath, data, 0o644); err != nil {
		return fmt.Errorf("write json: %w", err)
	}

	fmt.Printf("exported %d kills, %d rounds, %d players\n",
		out.Summary.KillsCount, out.Summary.RoundsCount, out.Summary.PlayersCount)
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}
