/**
 * Valibot schemas for the scanner domain, shared by the producer (match
 * builder/UI) and the validator (features/scanner-ingest). Every field is a
 * sendou.ink id type; the compile-time asserts at the bottom pin each schema
 * to its core interface. core/worker consume only the *types*, so valibot
 * never enters the worker bundle; validation happens at the boundaries.
 */
import * as v from "valibot";
import { abilities } from "~/modules/in-game-lists/abilities";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { Ability } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import type {
	ScannerMatch,
	ScannerMatchObjective,
	ScannerMatchPlayer,
	ScannerMatchPlayerStatus,
	ScannerMatchTeam,
} from "./core/scanner-match";
import { SCANNER_LOBBIES } from "./scanner-types";

const detectionText = v.pipe(v.string(), v.maxLength(500));

const scannerLobbySchema = v.picklist(SCANNER_LOBBIES);
export const modeShortSchema = v.picklist(modesShort);
export const stageIdSchema = v.picklist(stageIds);
export const mainWeaponIdSchema = v.picklist(mainWeaponIds);

const abilityNames = abilities.map((ability) => ability.name) as Ability[];
/** a sendou ability id, or the detectors' explicit unrecognized marker */
const scannerAbilitySchema = v.union([
	v.picklist(abilityNames),
	v.literal("UNKNOWN"),
]);

const scannerMatchPlayerSchema = v.object({
	name: v.nullable(detectionText),
	weaponId: v.nullable(mainWeaponIdSchema),
	paint: v.nullable(v.number()),
	ka: v.nullable(v.number()),
	d: v.nullable(v.number()),
	s: v.nullable(v.number()),
	/** [head, clothes, shoes] ability rows; a row may hold its main alone */
	abilities: v.optional(
		v.pipe(
			v.array(v.pipe(v.array(scannerAbilitySchema), v.maxLength(4))),
			v.maxLength(3),
		),
	),
});

const scannerMatchTeamSchema = v.object({
	players: v.pipe(v.array(scannerMatchPlayerSchema), v.maxLength(4)),
});

const teamIndexSchema = v.union([v.literal(0), v.literal(1)]);

/** counters change at most 1/s, so a match yields a few hundred samples */
const MAX_OBJECTIVE_SAMPLES = 1000;

const scannerMatchObjectiveSampleSchema = v.object({
	t: v.pipe(v.number(), v.integer(), v.minValue(0)),
	time: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	score: v.tuple([v.nullable(v.number()), v.nullable(v.number())]),
	penalty: v.tuple([v.nullable(v.number()), v.nullable(v.number())]),
	control: v.tuple([v.boolean(), v.boolean()]),
});

const scannerMatchObjectiveSchema = v.object({
	mode: v.literal("SZ"),
	samples: v.pipe(
		v.array(scannerMatchObjectiveSampleSchema),
		v.maxLength(MAX_OBJECTIVE_SAMPLES),
	),
});

const playerFlagsSchema = v.tuple([
	v.boolean(),
	v.boolean(),
	v.boolean(),
	v.boolean(),
]);

const scannerMatchPlayerStatusSampleSchema = v.object({
	t: v.pipe(v.number(), v.integer(), v.minValue(0)),
	time: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	special: v.tuple([playerFlagsSchema, playerFlagsSchema]),
	dead: v.tuple([playerFlagsSchema, playerFlagsSchema]),
});

const scannerMatchPlayerStatusSchema = v.object({
	samples: v.pipe(
		v.array(scannerMatchPlayerStatusSampleSchema),
		v.maxLength(MAX_OBJECTIVE_SAMPLES),
	),
});

export const scannerMatchSchema = v.object({
	startsAt: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	endsAt: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	/** wall-clock ms the game was played */
	playedAt: v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))),
	lobby: v.nullable(scannerLobbySchema),
	mode: v.nullable(modeShortSchema),
	stage: v.nullable(stageIdSchema),
	matchScores: v.nullable(
		v.tuple([v.nullable(v.number()), v.nullable(v.number())]),
	),
	replayCode: v.nullable(detectionText),
	cast: v.boolean(),
	objective: v.nullable(scannerMatchObjectiveSchema),
	playerStatus: v.nullable(scannerMatchPlayerStatusSchema),
	teams: v.tuple([scannerMatchTeamSchema, scannerMatchTeamSchema]),
	winner: v.nullable(teamIndexSchema),
	pov: v.nullable(
		v.object({
			team: teamIndexSchema,
			index: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3)),
		}),
	),
});

type MutuallyAssignable<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;

// `true satisfies …` fails to compile the moment a schema and its core
// interface disagree in either direction.
true satisfies MutuallyAssignable<
	v.InferOutput<typeof scannerMatchPlayerSchema>,
	ScannerMatchPlayer
>;
true satisfies MutuallyAssignable<
	v.InferOutput<typeof scannerMatchTeamSchema>,
	ScannerMatchTeam
>;
true satisfies MutuallyAssignable<
	v.InferOutput<typeof scannerMatchObjectiveSchema>,
	ScannerMatchObjective
>;
true satisfies MutuallyAssignable<
	v.InferOutput<typeof scannerMatchPlayerStatusSchema>,
	ScannerMatchPlayerStatus
>;
true satisfies MutuallyAssignable<
	v.InferOutput<typeof scannerMatchSchema>,
	ScannerMatch
>;
