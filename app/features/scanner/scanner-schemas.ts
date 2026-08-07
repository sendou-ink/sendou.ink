/**
 * Zod schemas for the scanner domain — the single source of truth shared by
 * the producer (the scanner match builder/UI in this feature) and the
 * validator (features/scanner-ingest). Every domain field is a sendou.ink id
 * type; the compile-time asserts at the bottom pin each schema to the
 * corresponding core interface so producer and validator cannot drift.
 *
 * The core/worker modules consume only the *types* (type-only imports point
 * the other way), so zod never enters the worker bundle; runtime validation
 * happens at the boundaries (ingest action, prefill loader).
 */
import { z } from "zod";
import { abilities } from "~/modules/in-game-lists/abilities";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { Ability } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import type {
	ScannerMatch,
	ScannerMatchObjective,
	ScannerMatchPlayer,
	ScannerMatchTeam,
} from "./core/scanner-match";
import { SCANNER_LOBBIES } from "./scanner-types";

const detectionText = z.string().max(500);

const scannerLobbySchema = z.enum(SCANNER_LOBBIES);
export const modeShortSchema = z.enum(modesShort);
export const stageIdSchema = z.literal(stageIds);
export const mainWeaponIdSchema = z.literal(mainWeaponIds);

const abilityNames = abilities.map((ability) => ability.name) as Ability[];
/** a sendou ability id, or the detectors' explicit unrecognized marker */
const scannerAbilitySchema = z.union([
	z.literal(abilityNames),
	z.literal("UNKNOWN"),
]);

const scannerMatchPlayerSchema = z.object({
	name: detectionText.nullable(),
	weaponId: mainWeaponIdSchema.nullable(),
	paint: z.number().nullable(),
	ka: z.number().nullable(),
	d: z.number().nullable(),
	s: z.number().nullable(),
	/** [head, clothes, shoes] ability rows harvested from death screens */
	abilities: z.array(z.array(scannerAbilitySchema).max(4)).max(3).optional(),
});

const scannerMatchTeamSchema = z.object({
	players: z.array(scannerMatchPlayerSchema).max(4),
});

const teamIndexSchema = z.union([z.literal(0), z.literal(1)]);

/** counters change at most 1/s, so a match yields a few hundred samples */
const MAX_OBJECTIVE_SAMPLES = 1000;

const scannerMatchObjectiveSampleSchema = z.object({
	t: z.number().int().min(0),
	time: z.number().int().min(0).nullable(),
	score: z.tuple([z.number().nullable(), z.number().nullable()]),
	penalty: z.tuple([z.number().nullable(), z.number().nullable()]),
	control: z.tuple([z.boolean(), z.boolean()]),
});

const scannerMatchObjectiveSchema = z.object({
	mode: z.literal("SZ"),
	samples: z
		.array(scannerMatchObjectiveSampleSchema)
		.max(MAX_OBJECTIVE_SAMPLES),
});

export const scannerMatchSchema = z.object({
	startsAt: z.number().int().min(0).nullable(),
	endsAt: z.number().int().min(0).nullable(),
	/** wall-clock ms the game was played */
	playedAt: z.number().int().positive().nullable(),
	lobby: scannerLobbySchema.nullable(),
	mode: modeShortSchema.nullable(),
	stage: stageIdSchema.nullable(),
	matchScores: z
		.tuple([z.number().nullable(), z.number().nullable()])
		.nullable(),
	replayCode: detectionText.nullable(),
	cast: z.boolean(),
	objective: scannerMatchObjectiveSchema.nullable(),
	teams: z.tuple([scannerMatchTeamSchema, scannerMatchTeamSchema]),
	winner: teamIndexSchema.nullable(),
	pov: z
		.object({ team: teamIndexSchema, index: z.number().int().min(0).max(3) })
		.nullable(),
});

// ---- compile-time drift protection: schema output <-> core interface ----

type MutuallyAssignable<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;

// `true satisfies …` fails to compile the moment a schema and its core
// interface disagree in either direction.
true satisfies MutuallyAssignable<
	z.infer<typeof scannerMatchPlayerSchema>,
	ScannerMatchPlayer
>;
true satisfies MutuallyAssignable<
	z.infer<typeof scannerMatchTeamSchema>,
	ScannerMatchTeam
>;
true satisfies MutuallyAssignable<
	z.infer<typeof scannerMatchObjectiveSchema>,
	ScannerMatchObjective
>;
true satisfies MutuallyAssignable<
	z.infer<typeof scannerMatchSchema>,
	ScannerMatch
>;
