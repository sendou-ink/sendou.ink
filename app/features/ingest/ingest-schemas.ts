import { z } from "zod";
import { id } from "~/utils/zod";

// xxx: we can make these more strict e.g. validate is a proper mode etc.

const INGEST_MAX_EVENTS_PER_REQUEST = 1000;

const detectionText = z.string().max(500);

const scoreboardPlayerSchema = z.object({
	name: detectionText,
	/** sendou main-weapon id; null when the row's weapon was unreadable */
	weaponId: z.number().int().nullable(),
	paint: z.number().nullable(),
	ka: z.number().nullable(),
	d: z.number().nullable(),
	s: z.number().nullable(),
	/** [head, clothes, shoes] ability rows gathered from the match's death screens */
	abilities: z.array(z.array(detectionText)).optional(),
});

const scoreboardDataSchema = z.object({
	lobby: detectionText.nullable(),
	mode: detectionText.nullable(),
	stage: detectionText.nullable(),
	scores: z.tuple([z.number().nullable(), z.number().nullable()]),
	players: z.array(scoreboardPlayerSchema).length(8),
	povIndex: z.number().int().min(0).max(7).nullable(),
});

const scoreboardReplayDataSchema = scoreboardDataSchema.extend({
	timestamp: detectionText.nullable(),
	replayCode: detectionText.nullable(),
	matchScores: z.tuple([z.number().nullable(), z.number().nullable()]),
});

const deathDataSchema = z.object({
	weapon: detectionText.nullable(),
	// xxx: these ids conflict so more info will be needed
	/** sendou weapon id (main/sub/special id space per weaponType) */
	weaponId: z.number().int().nullable(),
	weaponType: z.enum(["MAIN", "SUB", "SPECIAL"]).nullable(),
	abilities: z.array(z.array(detectionText)),
	name: detectionText.nullable(),
});

const mapStartDataSchema = z.object({
	mode: detectionText.nullable(),
	stage: detectionText.nullable(),
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
		data: deathDataSchema,
	}),
	eventBaseSchema.extend({
		type: z.literal("MapStart"),
		data: mapStartDataSchema,
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
