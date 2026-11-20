/** How a scanner match is split for storage: the timelines, nearly all of its size and only read by match pages, are kept Brotli-compressed apart from the queryable JSON. */
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import type {
	ScannerMatch,
	ScannerMatchObjective,
	ScannerMatchPlayerStatus,
} from "~/features/scanner/core/scanner-match";

/** Quality 11 compresses ~20% smaller but ~100x slower, too slow for the ingest request. */
const BROTLI_QUALITY = 9;

/** The `IngestedMatch.data` JSON: a scanner match without its timelines. */
export type StoredScannerMatch = Omit<
	ScannerMatch,
	"objective" | "playerStatus"
>;

interface Timelines {
	objective: ScannerMatchObjective | null;
	playerStatus: ScannerMatchPlayerStatus | null;
}

/** Splits a match into its `IngestedMatch.data` JSON and compressed `IngestedMatch.timelines` (null when neither timeline was read). */
export function toStored(match: ScannerMatch): {
	data: StoredScannerMatch;
	timelines: Uint8Array | null;
} {
	const { objective, playerStatus, ...data } = match;
	if (objective === null && playerStatus === null) {
		return { data, timelines: null };
	}

	const timelines: Timelines = { objective, playerStatus };
	const json = JSON.stringify(timelines);

	return {
		data,
		timelines: brotliCompressSync(json, {
			params: {
				[constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
				[constants.BROTLI_PARAM_SIZE_HINT]: json.length,
			},
		}),
	};
}

/** Reassembles the match {@link toStored} split. */
export function fromStored({
	data,
	timelines,
}: {
	data: StoredScannerMatch;
	timelines: Uint8Array | null;
}): ScannerMatch {
	if (timelines === null) {
		return { ...data, objective: null, playerStatus: null };
	}

	const parsed: Timelines = JSON.parse(
		brotliDecompressSync(timelines).toString("utf8"),
	);

	return {
		...data,
		objective: parsed.objective,
		playerStatus: parsed.playerStatus,
	};
}
