import { describe, expect, test } from "vitest";
import { gameTimelineProps } from "../../components/game-timeline-view";
import type { ScannerMatch, ScannerMatchKill } from "../../core/scanner-match";

const LABELS = ["Alpha", "Bravo"] as const;

const player = (name: string | null) => ({
	name,
	weaponId: null,
	paint: null,
	ka: null,
	d: null,
	s: null,
});

const MATCH: ScannerMatch = {
	startsAt: 100,
	endsAt: 400,
	playedAt: null,
	lobby: "PRIVATE",
	mode: "TC",
	stage: 3,
	matchScores: [100, 0],
	replayCode: null,
	cast: false,
	objective: {
		mode: "SZ",
		samples: [
			{
				t: 110,
				time: 290,
				score: [90, 100],
				penalty: [null, 5],
				control: [true, false],
			},
		],
	},
	playerStatus: null,
	kills: null,
	teams: [
		{
			players: [
				player("Jrod_14"),
				player("Elis"),
				player("GOLD SHIP"),
				player("merocï¬・~"),
			],
		},
		{
			players: [
				player("Florescent"),
				player("くらうに ★~"),
				player("Bocchi"),
				player("have faith"),
			],
		},
	],
	winner: 0,
	pov: { team: 1, index: 3 },
};

const withKills = (
	kills: ScannerMatchKill[],
	teams: ScannerMatch["teams"] = MATCH.teams,
): ScannerMatch => ({ ...MATCH, kills, teams });

describe("gameTimelineProps", () => {
	test("puts the POV's team first", () => {
		const props = gameTimelineProps(MATCH, 100, LABELS);

		expect(props.objectiveEvents![0]).toEqual({
			t: 10,
			data: {
				time: 290,
				score: [100, 90],
				penalty: [5, null],
				control: [false, true],
			},
		});
		expect(props.pov?.side).toBe(0);
		expect(props.pov?.slot).toBe(3);
	});

	test("has no POV row on footage without a seat", () => {
		const props = gameTimelineProps(
			{ ...withKills([{ t: 150, time: 250, name: "Elis" }]), pov: null },
			100,
			LABELS,
		);

		expect(props.pov).toBeUndefined();
	});

	test.each([
		{ why: "exact name", name: "Jrod_14", victimSlot: 0 },
		{
			why: "garbled symbols, others far off",
			name: "merocïつ·˜",
			victimSlot: 3,
		},
		{ why: "unrelated name", name: "Squidward", victimSlot: null },
		{ why: "unread name", name: null, victimSlot: null },
	])("pins a kill on its victim's row: $why", ({ name, victimSlot }) => {
		const props = gameTimelineProps(
			withKills([{ t: 150, time: 250, name }]),
			100,
			LABELS,
		);

		expect(props.pov?.kills[0]?.victimSlot).toBe(victimSlot);
	});

	test.each([
		{ why: "exact read beats a lookalike", name: "Sendou1", victimSlot: 0 },
		{
			why: "two lookalikes fit about as well",
			name: "Sendou",
			victimSlot: null,
		},
	])("near-twin enemy names: $why", ({ name, victimSlot }) => {
		const teams: ScannerMatch["teams"] = [
			{ players: [player("Sendou1"), player("Sendou2")] },
			MATCH.teams[1],
		];
		const props = gameTimelineProps(
			withKills([{ t: 150, time: 250, name }], teams),
			100,
			LABELS,
		);

		expect(props.pov?.kills[0]?.victimSlot).toBe(victimSlot);
	});
});
