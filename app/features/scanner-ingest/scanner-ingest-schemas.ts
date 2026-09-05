import * as v from "valibot";
import { scannerMatchSchema } from "~/features/scanner/scanner-schemas";

const MAX_MATCHES_PER_REQUEST = 50;

/** The ScannerMatch shape comes from ~/features/scanner/scanner-schemas; this only adds the ingest envelope. The POV user is always the session user, never client-supplied. */
export const ingestBodySchema = v.object({
	matches: v.pipe(
		v.array(scannerMatchSchema),
		v.minLength(1),
		v.maxLength(MAX_MATCHES_PER_REQUEST),
	),
});

/** The sendou.ink match an ingested match's scoreboard was linked to. */
export type IngestedMatchLink =
	| { type: "tournament"; tournamentId: number; matchId: number }
	| { type: "sendouq"; groupMatchId: number };

export interface IngestResponse {
	storedMatchesCount: number;
	mergedMatchesCount: number;
	linkedGamesCount: number;
	/** per request match (by its index in the body's `matches`), the match it linked to */
	linkedMatches: Array<{ matchIndex: number; link: IngestedMatchLink }>;
	/** whether the matches resolved to a tournament or SendouQ match; one unlinked despite that waits for its game's report, so a resend can still link it */
	contextResolved: boolean;
}
