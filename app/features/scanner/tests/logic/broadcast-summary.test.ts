import { describe, expect, test } from "vitest";
import { gameSummary } from "../../core/broadcast-summary";
import type { DetectedEvent } from "../../core/detectors/types";
import type { BuiltMatch } from "../../core/match-builder";
import type {
	ScannerMatch,
	ScannerMatchObjectiveSample,
	ScannerMatchPlayer,
} from "../../core/scanner-match";

describe("gameSummary", () => {
	test("keeps each player's main abilities", () => {
		const summary = gameSummary(
			built({
				players: [
					player({
						abilities: [["LDE", "SSU", "SSU"], ["CB"], ["SJ", "QR"]],
					}),
					player({ abilities: [["NS"]] }),
				],
			}),
			{ isKnockout: false },
		);

		expect(
			summary.teams[0].players.map((summaryPlayer) => summaryPlayer.abilities),
		).toEqual([
			["LDE", "CB", "SJ"],
			["NS", "UNKNOWN", "UNKNOWN"],
		]);
	});

	test.each([
		{ why: "none were read", abilities: undefined },
		{ why: "every main is unknown", abilities: [["UNKNOWN" as const]] },
	])("leaves the abilities out when $why", ({ abilities }) => {
		const summary = gameSummary(built({ players: [player({ abilities })] }), {
			isKnockout: false,
		});

		expect(summary.teams[0].players[0]?.abilities).toEqual([]);
	});

	test("keeps the counter reads where something changed and the last one, timed from the first", () => {
		const summary = gameSummary(
			built({
				samples: [
					sample(100, [100, 100], null),
					sample(110, [100, 100], null),
					sample(120, [90, 100], 0),
					sample(130, [90, 100], 0),
					sample(140, [90, 100], 0),
				],
			}),
			{ isKnockout: true },
		);

		expect(summary.objective).toEqual([
			{ t: 0, score: [100, 100], control: null },
			{ t: 20, score: [90, 100], control: 0 },
			{ t: 40, score: [90, 100], control: 0 },
		]);
		expect(summary.isKnockout).toBe(true);
	});

	test("gives the teams' inks as the minimap showed them, unread without", () => {
		const ink = { r: 1, g: 2, b: 3 };

		expect(
			gameSummary({ ...built({}), inks: [ink, null] }, { isKnockout: false })
				.inks,
		).toEqual([ink, null]);
		expect(gameSummary(built({}), { isKnockout: false }).inks).toEqual([
			null,
			null,
		]);
	});
});

function built({
	players = [],
	samples = [],
}: {
	players?: ScannerMatchPlayer[];
	samples?: ScannerMatchObjectiveSample[];
}): BuiltMatch<DetectedEvent> {
	const match: ScannerMatch = {
		startsAt: 0,
		endsAt: 300,
		playedAt: null,
		lobby: null,
		mode: "SZ",
		stage: 10,
		matchScores: null,
		replayCode: null,
		cast: true,
		objective: samples.length > 0 ? { mode: "SZ", samples } : null,
		playerStatus: null,
		kills: null,
		teams: [{ players }, { players: [] }],
		winner: null,
		pov: null,
	};

	return { match, sources: [] };
}

function player(overrides: Partial<ScannerMatchPlayer>): ScannerMatchPlayer {
	return {
		name: "Noodle",
		weaponId: 40,
		paint: null,
		ka: null,
		d: null,
		s: null,
		...overrides,
	};
}

function sample(
	t: number,
	score: [number, number],
	control: 0 | 1 | null,
): ScannerMatchObjectiveSample {
	return { t, time: null, score, penalty: [null, null], control };
}
