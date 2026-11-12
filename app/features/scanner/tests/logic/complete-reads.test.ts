import { describe, expect, test } from "vitest";
import type { DeathData } from "../../core/detectors/death/index";
import type { MapStartData } from "../../core/detectors/map-start/index";
import type {
	MinimapData,
	MinimapTeammate,
} from "../../core/detectors/minimap/index";
import type { ScoreboardData } from "../../core/detectors/scoreboard/index";
import type { ScoreboardOwnData } from "../../core/detectors/scoreboard-own/index";
import { type DetectedEvent, isComplete } from "../../core/events";
import type { FieldScores } from "../../core/field-scores";

/** A score every floor of a complete read clears. */
const CLEAN = 0.9;

const ROW_FIELDS = ["weaponId", "paint", "name", "ka", "d", "s"] as const;

const BOARD: ScoreboardData = {
	lobby: "PRIVATE",
	mode: "SZ",
	stage: 3,
	matchScores: [100, 47],
	players: Array.from({ length: 8 }, (_, i) => ({
		name: `p${i}`,
		weaponId: 40,
		paint: 1000 + i,
		ka: 10,
		d: 5,
		s: 2,
	})),
	povIndex: 0,
};

const BOARD_SCORES: FieldScores = {
	...Object.fromEntries(
		BOARD.players.flatMap((_, i) =>
			ROW_FIELDS.map((field) => [`players.${i}.${field}`, CLEAN]),
		),
	),
	lobby: CLEAN,
	"mode,stage": CLEAN,
	"matchScores.0": CLEAN,
	"matchScores.1": CLEAN,
};

const HISTORY: { timestamp: string | null; replayCode: string | null } = {
	timestamp: "3/7/2026 21:15",
	replayCode: "RVRM-XXEL-0573-Q45U",
};

const GEAR: DeathData["abilities"] = [
	["ISM", "ISS", "ISS", "ISS"],
	["SSU", "QR"],
	["SJ", "SS", "SS", "SS"],
];

const GEAR_SCORES: FieldScores = Object.fromEntries(
	GEAR.flatMap((row, gear) =>
		row.map((_, slot) => [`abilities.${gear}.${slot}`, CLEAN]),
	),
);

const DEATH: DeathData = {
	weaponId: 40,
	weaponType: "MAIN",
	abilities: GEAR,
	name: "Sendou",
};

const DEATH_SCORES: FieldScores = {
	"weaponId,weaponType": CLEAN,
	...GEAR_SCORES,
	name: CLEAN,
};

const OWN: ScoreboardOwnData = {
	lobby: "SERIES",
	mode: "SZ",
	stage: 3,
	weaponId: 40,
	abilities: Array.from({ length: 3 }, () => ["ISM", "ISS", "ISS", "ISS"]),
};

const OWN_SCORES: FieldScores = {
	lobby: CLEAN,
	"mode,stage": CLEAN,
	weaponId: CLEAN,
	...Object.fromEntries(
		OWN.abilities.flatMap((row, gear) =>
			row.map((_, slot) => [`abilities.${gear}.${slot}`, CLEAN]),
		),
	),
};

const CARD: MinimapTeammate = {
	self: false,
	name: "Sendou",
	weaponId: 40,
	abilities: ["ISM", "SSU", "SJ"],
	dead: false,
	specialReady: false,
};

const CROSSED_OUT: MinimapTeammate = {
	...CARD,
	name: null,
	abilities: [],
	dead: true,
};

function minimap(
	spectator: boolean,
	teammates: MinimapTeammate[],
	enemies: MinimapData["enemies"] = [CARD],
): MinimapData {
	return {
		stage: 3,
		spectator,
		teammates,
		enemies,
		teamColors: [null, null],
	};
}

/** Every card's name scored `CLEAN`, but for the overrides. */
function nameScores(
	data: MinimapData,
	overrides: FieldScores = {},
): FieldScores {
	return {
		...Object.fromEntries(
			(["teammates", "enemies"] as const).flatMap((side) =>
				data[side].map((_, i) => [`${side}.${i}.name`, CLEAN]),
			),
		),
		...overrides,
	};
}

function board(
	data: Partial<ScoreboardData> = {},
	scores: FieldScores = {},
): DetectedEvent {
	return {
		type: "Scoreboard",
		t: 0,
		scores: { ...BOARD_SCORES, ...scores },
		data: { ...BOARD, ...data },
	};
}

function withPlayer(
	row: number,
	player: Partial<ScoreboardData["players"][number]>,
): ScoreboardData["players"] {
	return BOARD.players.map((kept, i) =>
		i === row ? { ...kept, ...player } : kept,
	);
}

function replay(data: Partial<typeof HISTORY> = {}): DetectedEvent {
	return {
		type: "ScoreboardBattleLogReplay",
		t: 0,
		scores: BOARD_SCORES,
		data: { ...BOARD, ...HISTORY, ...data },
	};
}

function battleLog(data: Partial<ScoreboardData> = {}): DetectedEvent {
	return {
		type: "ScoreboardBattleLog",
		t: 0,
		scores: BOARD_SCORES,
		data: { ...BOARD, timestamp: HISTORY.timestamp, ...data },
	};
}

function own(
	data: Partial<ScoreboardOwnData> = {},
	scores: FieldScores = OWN_SCORES,
): DetectedEvent {
	return { type: "ScoreboardOwn", t: 0, scores, data: { ...OWN, ...data } };
}

function death(
	data: Partial<DeathData> = {},
	scores: FieldScores = {},
): DetectedEvent {
	return {
		type: "Death",
		t: 0,
		scores: { ...DEATH_SCORES, ...scores },
		data: { ...DEATH, ...data },
	};
}

function intro(data: MapStartData, scores: FieldScores): DetectedEvent {
	return { type: "MapStart", t: 0, scores, data };
}

function map(data: MinimapData, scores: FieldScores = {}): DetectedEvent {
	return { type: "Minimap", t: 0, scores: nameScores(data, scores), data };
}

function withoutScore(scores: FieldScores, field: string): FieldScores {
	const { [field]: _dropped, ...rest } = scores;
	return rest;
}

describe("isComplete", () => {
	test.each<{ why: string; event: DetectedEvent; expected: boolean }>([
		{ why: "a board read whole", event: board(), expected: true },
		{
			why: "a board with a name under its floor",
			event: board({}, { "players.3.name": 0.55 }),
			expected: false,
		},
		{
			why: "a board with a stat counter under its floor",
			event: board({}, { "players.0.d": 0.7 }),
			expected: false,
		},
		{
			why: "a board with a weapon unread",
			event: board({ players: withPlayer(5, { weaponId: null }) }),
			expected: false,
		},
		{
			why: "a board with a paint total unread",
			event: board({ players: withPlayer(2, { paint: null }) }),
			expected: false,
		},
		{
			why: "a board with the loser's score unread",
			event: board({ matchScores: [100, null] }),
			expected: false,
		},
		{
			why: "a board with its lobby unread",
			event: board({ lobby: null }),
			expected: false,
		},
		{
			why: "a board with its stage unread",
			event: board({ stage: null }),
			expected: false,
		},
		{
			why: "a no-contest board, which shows no score",
			event: board({ noContest: true, matchScores: [null, null] }),
			expected: true,
		},
		{
			why: "a board with no rows",
			event: board({ players: [] }),
			expected: false,
		},
		{ why: "a replay entry read whole", event: replay(), expected: true },
		{
			why: "a replay entry with its code unread",
			event: replay({ replayCode: null }),
			expected: false,
		},
		{
			why: "a replay entry with its timestamp unread",
			event: replay({ timestamp: null }),
			expected: false,
		},
		{
			why: "a battle log entry read whole, which has no code",
			event: battleLog(),
			expected: true,
		},
		{
			why: "a battle log entry with a score unread",
			event: battleLog({ matchScores: [null, 47] }),
			expected: false,
		},
		{ why: "personal results read whole", event: own(), expected: true },
		{
			why: "personal results with a covered badge",
			event: own({}, withoutScore(OWN_SCORES, "abilities.2.3")),
			expected: false,
		},
		{
			why: "personal results with the weapon unread",
			event: own({ weaponId: null }),
			expected: false,
		},
		{ why: "a death read whole", event: death(), expected: true },
		{
			why: "a death with the killer's name under its floor",
			event: death({}, { name: 0.65 }),
			expected: false,
		},
		{
			why: "a death with the killer's name unread",
			event: death({ name: null }),
			expected: false,
		},
		{
			why: "a death with a badge under its floor",
			event: death({}, { "abilities.1.1": 0.6 }),
			expected: false,
		},
		{
			why: "a death with the weapon unread",
			event: death({ weaponId: null, weaponType: null }),
			expected: false,
		},
		{
			why: "a death with a gear row missing",
			event: death({ abilities: GEAR.slice(0, 2) }),
			expected: false,
		},
		{
			why: "an intro with both lines read",
			event: intro({ mode: "SZ", stage: 3 }, { mode: CLEAN, stage: CLEAN }),
			expected: true,
		},
		{
			why: "an intro with the stage line unread",
			event: intro({ mode: "SZ", stage: null }, { mode: CLEAN }),
			expected: false,
		},
		{
			why: "an intro with a line snapped under its floor",
			event: intro({ mode: "SZ", stage: 3 }, { mode: 0.65, stage: CLEAN }),
			expected: false,
		},
		{
			why: "a POV overlay with every live card named, a weapon unread",
			event: map(minimap(false, [CARD, { ...CARD, weaponId: null }])),
			expected: true,
		},
		{
			why: "a POV overlay with a crossed-out card",
			event: map(minimap(false, [CARD, CROSSED_OUT])),
			expected: true,
		},
		{
			why: "a POV overlay with a live card's name under its floor",
			event: map(minimap(false, [CARD, CARD]), { "teammates.1.name": 0.66 }),
			expected: false,
		},
		{
			why: "a POV overlay with a live card's name unread",
			event: map(minimap(false, [CARD, { ...CARD, name: null }])),
			expected: false,
		},
		{
			why: "a spectator screen with every card whole",
			event: map(minimap(true, [CARD, CROSSED_OUT])),
			expected: true,
		},
		{
			why: "a spectator screen with a weapon unread",
			event: map(minimap(true, [CARD], [{ ...CARD, weaponId: null }])),
			expected: false,
		},
		{
			why: "a spectator screen with a badge unread",
			event: map(minimap(true, [{ ...CARD, abilities: ["ISM", null, "SJ"] }])),
			expected: false,
		},
		{
			why: "a spectator screen with an enemy's name under its floor",
			event: map(minimap(true, [CARD]), { "enemies.0.name": 0.62 }),
			expected: false,
		},
		{
			why: "a kind that declares no complete read",
			event: {
				type: "Kill",
				t: 0,
				scores: { "names.0": 1 },
				data: { time: 100, names: ["Sendou"] },
			},
			expected: false,
		},
	])("$why: $expected", ({ event, expected }) => {
		expect(isComplete(event)).toBe(expected);
	});
});
