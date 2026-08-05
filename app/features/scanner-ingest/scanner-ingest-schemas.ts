import { z } from "zod";
import {
	scannerAbilitySchema,
	scannerDeathDataSchema,
	scannerMapStartDataSchema,
	scannerScoreboardDataSchema,
	scannerScoreboardPlayerSchema,
	scannerScoreboardReplayDataSchema,
} from "~/features/scanner/scanner-schemas";
import { id } from "~/utils/zod";

const INGEST_MAX_EVENTS_PER_REQUEST = 1000;

/**
 * The event data shapes come from the producer (~/features/scanner/scanner-schemas —
 * the single source of truth for the scanner events domain); this module only
 * adds the ingest-specific envelope and enrichments.
 */

/** [head, clothes, shoes] ability rows gathered from the match's death screens */
const scoreboardPlayerSchema = scannerScoreboardPlayerSchema.extend({
	abilities: z.array(z.array(scannerAbilitySchema)).optional(),
});

const scoreboardDataSchema = scannerScoreboardDataSchema.extend({
	players: z.array(scoreboardPlayerSchema).length(8),
});

const scoreboardReplayDataSchema = scannerScoreboardReplayDataSchema.extend({
	players: z.array(scoreboardPlayerSchema).length(8),
});

const eventBaseSchema = z.object({
	/** seconds into the stream/video the event was detected at */
	t: z.number().min(0),
	/** wall-clock timestamp (ms) of the detection */
	detectedAt: z.number().int().positive().optional(),
	confidence: z.number().min(0).max(1),
});

const ingestedEventSchema = z.discriminatedUnion("type", [
	eventBaseSchema.extend({
		type: z.literal("Scoreboard"),
		data: scoreboardDataSchema,
	}),
	eventBaseSchema.extend({
		type: z.literal("ScoreboardReplay"),
		/**
		 * when the replay's game was played (UTC ms), derived client-side from
		 * the replay browser's on-screen timestamp
		 */
		recordedAt: z.number().int().positive().optional(),
		data: scoreboardReplayDataSchema,
	}),
	eventBaseSchema.extend({
		type: z.literal("Death"),
		data: scannerDeathDataSchema,
	}),
	eventBaseSchema.extend({
		type: z.literal("MapStart"),
		data: scannerMapStartDataSchema,
	}),
]);

export const ingestBodySchema = z.object({
	/** the user whose point of view the events were detected from */
	povUserId: id.optional(),
	tournamentId: id.optional(),
	events: z
		.array(ingestedEventSchema)
		.min(1)
		.max(INGEST_MAX_EVENTS_PER_REQUEST),
});

export type IngestedEventInput = z.infer<typeof ingestedEventSchema>;
export type IngestedEventData = IngestedEventInput["data"];
export type ScoreboardEventInput = Extract<
	IngestedEventInput,
	{ type: "Scoreboard" | "ScoreboardReplay" }
>;
