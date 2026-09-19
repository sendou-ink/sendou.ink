/** Tests for the Matches export: one row per game, POV-first scores, packed rosters, blanks for unread values. */

import assert from "node:assert/strict";
import { matchesToCsv } from "../../core/csv/matches";
import type { ScannerMatch } from "../../core/scanner-match";
import { test } from "../node-test-compat";

const BASE: ScannerMatch = {
	startsAt: 3730,
	endsAt: 4000,
	playedAt: Date.UTC(2026, 8, 16, 17, 2),
	lobby: "PRIVATE",
	mode: "TC",
	stage: 3,
	matchScores: [62, 100],
	replayCode: "RXYZ-1234-ABCD-5678",
	cast: false,
	objective: null,
	playerStatus: null,
	kills: null,
	teams: [
		{
			players: [
				{ name: "Kirby", weaponId: 1000, paint: 980, ka: 6, d: 5, s: 2 },
			],
		},
		{
			players: [
				{ name: "You", weaponId: 40, paint: 1204, ka: 9, d: 4, s: 3 },
				{ name: "Zed", weaponId: 30, paint: 1310, ka: 6, d: 2, s: 4 },
			],
		},
	],
	winner: 1,
	pov: { team: 1, index: 0 },
};

function rows(csv: string): string[][] {
	return csv
		.trim()
		.split("\r\n")
		.map((line) => line.split(","));
}

test("one row per game with the POV side first", () => {
	const [header, row] = rows(
		matchesToCsv([BASE], { label: "sws26-finals.mkv", originT: 0 }, [2]),
	);
	assert.equal(header![0], "played_at");
	const cell = (name: string) => row![header!.indexOf(name)];
	assert.equal(cell("source"), "sws26-finals.mkv");
	assert.equal(cell("at"), "01:02:10");
	assert.equal(cell("t_seconds"), "3730");
	assert.equal(cell("lobby"), "Private Battle");
	assert.equal(cell("mode"), "Tower Control");
	assert.equal(cell("result"), "WIN");
	assert.equal(cell("score_for"), "100");
	assert.equal(cell("score_against"), "62");
	assert.equal(cell("weapon"), "Splattershot");
	assert.equal(cell("ka"), "9");
	assert.equal(cell("d"), "4");
	assert.equal(cell("s"), "3");
	assert.equal(cell("paint"), "1204");
	assert.equal(cell("clips"), "2");
	assert.equal(cell("cast"), "");
});

test("positions count from the session's origin", () => {
	const [header, row] = rows(
		matchesToCsv([BASE], { label: "2026-09-16 19:02", originT: 3700 }),
	);
	assert.equal(row![header!.indexOf("at")], "00:00:30");
	assert.equal(row![header!.indexOf("t_seconds")], "30");
});

test("teammates exclude the POV row and enemies pack the other side", () => {
	const csv = matchesToCsv([BASE], { label: "x", originT: 0 });
	assert.match(csv, /Zed · Aerospray MG · 6\/2\/4 · 1310p/);
	assert.match(csv, /Kirby · Carbon Roller · 6\/5\/2 · 980p/);
	assert.doesNotMatch(csv, /You · Splattershot · 9\/4\/3/);
});

test("unread values are blank cells, not question marks", () => {
	const [header, row] = rows(
		matchesToCsv(
			[
				{
					...BASE,
					playedAt: null,
					mode: null,
					stage: null,
					matchScores: null,
					replayCode: null,
					winner: null,
					pov: null,
					teams: [{ players: [] }, { players: [] }],
				},
			],
			{ label: "x", originT: 0 },
		),
	);
	for (const name of [
		"played_at",
		"mode",
		"stage",
		"result",
		"score_for",
		"weapon",
		"ka",
		"teammates",
		"replay_code",
	]) {
		assert.equal(row![header!.indexOf(name)], "", name);
	}
});
