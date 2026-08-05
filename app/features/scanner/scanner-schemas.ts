/**
 * Zod schemas for the scanner events domain — the single source of truth shared
 * by the producer (the scanner detectors/UI in this feature) and the validator
 * (features/ingest). Every domain field is a sendou.ink id type; the
 * compile-time asserts at the bottom pin each schema to the corresponding
 * detector output interface so producer and validator cannot drift.
 *
 * The detectors/worker consume only the *types* (type-only imports point
 * the other way), so zod never enters the worker bundle; runtime
 * validation happens at the boundaries (ingest action, prefill loader).
 */
import { z } from "zod";
import { abilities } from "~/modules/in-game-lists/abilities";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { Ability } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import type { DeathData } from "./core/detectors/death/index";
import type { MapStartData } from "./core/detectors/map-start/index";
import type {
	ScoreboardData,
	ScoreboardPlayer,
} from "./core/detectors/scoreboard/index";
import type { ScoreboardReplayData } from "./core/detectors/scoreboard-replay/index";
import { SCANNER_LOBBIES } from "./scanner-types";

const detectionText = z.string().max(500);

const scannerLobbySchema = z.enum(SCANNER_LOBBIES);
export const modeShortSchema = z.enum(modesShort);
export const stageIdSchema = z.literal(stageIds);
export const mainWeaponIdSchema = z.literal(mainWeaponIds);
const subWeaponIdSchema = z.literal(subWeaponIds);
const specialWeaponIdSchema = z.literal(specialWeaponIds);

const abilityNames = abilities.map((ability) => ability.name) as Ability[];
/** a sendou ability id, or the detectors' explicit unrecognized marker */
export const scannerAbilitySchema = z.union([
	z.literal(abilityNames),
	z.literal("UNKNOWN"),
]);

export const scannerScoreboardPlayerSchema = z.object({
	name: detectionText,
	/** sendou main-weapon id; null when the row's weapon was unreadable */
	weaponId: mainWeaponIdSchema.nullable(),
	paint: z.number().nullable(),
	ka: z.number().nullable(),
	d: z.number().nullable(),
	s: z.number().nullable(),
});

export const scannerScoreboardDataSchema = z.object({
	lobby: scannerLobbySchema.nullable(),
	mode: modeShortSchema.nullable(),
	stage: stageIdSchema.nullable(),
	scores: z.tuple([z.number().nullable(), z.number().nullable()]),
	players: z.array(scannerScoreboardPlayerSchema).length(8),
	povIndex: z.number().int().min(0).max(7).nullable(),
});

export const scannerScoreboardReplayDataSchema =
	scannerScoreboardDataSchema.extend({
		timestamp: detectionText.nullable(),
		replayCode: detectionText.nullable(),
		matchScores: z.tuple([z.number().nullable(), z.number().nullable()]),
	});

export const scannerDeathDataSchema = z.object({
	/** sendou weapon id (main/sub/special id space per weaponType) */
	weaponId: z
		.union([mainWeaponIdSchema, subWeaponIdSchema, specialWeaponIdSchema])
		.nullable(),
	weaponType: z.enum(["MAIN", "SUB", "SPECIAL"]).nullable(),
	abilities: z.array(z.array(scannerAbilitySchema)),
	name: detectionText.nullable(),
});

export const scannerMapStartDataSchema = z.object({
	mode: modeShortSchema.nullable(),
	stage: stageIdSchema.nullable(),
});

// ---- compile-time drift protection: schema output <-> detector output ----

type MutuallyAssignable<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;

// `true satisfies …` fails to compile the moment a schema and its detector
// interface disagree in either direction.
true satisfies MutuallyAssignable<
	z.infer<typeof scannerScoreboardPlayerSchema>,
	ScoreboardPlayer
>;
true satisfies MutuallyAssignable<
	z.infer<typeof scannerScoreboardDataSchema>,
	ScoreboardData
>;
true satisfies MutuallyAssignable<
	z.infer<typeof scannerScoreboardReplayDataSchema>,
	ScoreboardReplayData
>;
true satisfies MutuallyAssignable<
	z.infer<typeof scannerDeathDataSchema>,
	DeathData
>;
true satisfies MutuallyAssignable<
	z.infer<typeof scannerMapStartDataSchema>,
	MapStartData
>;
