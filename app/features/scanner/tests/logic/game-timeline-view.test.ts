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
				control: 0,
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
	test("flips a track position along with the sides", () => {
		const props = gameTimelineProps(
			{
				...MATCH,
				objective: {
					mode: "TC",
					samples: [
						{
							t: 110,
							time: 290,
							score: [60, null],
							penalty: [null, null],
							control: 0,
							position: 40,
						},
					],
				},
			},
			100,
			LABELS,
		);

		expect(props.objectiveEvents![0]!.data).toMatchObject({
			score: [null, 60],
			control: 1,
			position: -40,
		});
	});

	test("puts the POV's team first", () => {
		const props = gameTimelineProps(MATCH, 100, LABELS);

		expect(props.objectiveEvents![0]).toEqual({
			t: 10,
			data: {
				time: 290,
				score: [100, 90],
				penalty: [5, null],
				control: 1,
			},
		});
		expect(props.killers).toEqual([{ side: 0, slot: 3, pov: true, kills: [] }]);
	});

	test("has no killer rows on footage without a seat or a camera read", () => {
		const props = gameTimelineProps(
			{ ...withKills([{ t: 150, time: 250, name: "Elis" }]), pov: null },
			100,
			LABELS,
		);

		expect(props.killers).toEqual([]);
	});

	test("puts a cast's kills on the row the camera was on at each", () => {
		const sample = (t: number, index: number) => ({
			t,
			time: null,
			special: [
				[false, false, false, false],
				[false, false, false, false],
			] as NonNullable<
				ScannerMatch["playerStatus"]
			>["samples"][number]["special"],
			dead: [
				[false, false, false, false],
				[false, false, false, false],
			] as NonNullable<ScannerMatch["playerStatus"]>["samples"][number]["dead"],
			spectated: { team: 1 as const, index },
		});
		const props = gameTimelineProps(
			{
				...withKills([
					{ t: 150, time: 250, name: "Elis" },
					{ t: 170, time: 230, name: "Jrod_14" },
				]),
				pov: null,
				cast: true,
				playerStatus: { samples: [sample(149, 2), sample(169, 0)] },
			},
			100,
			LABELS,
		);

		expect(
			props.killers?.map((killer) => ({
				side: killer.side,
				slot: killer.slot,
				victims: killer.kills.map((kill) => kill.victimSlot),
			})),
		).toEqual([
			{ side: 1, slot: 2, victims: [1] },
			{ side: 1, slot: 0, victims: [0] },
		]);
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

		expect(props.killers?.[0]?.kills[0]?.victimSlot).toBe(victimSlot);
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

		expect(props.killers?.[0]?.kills[0]?.victimSlot).toBe(victimSlot);
	});
});
