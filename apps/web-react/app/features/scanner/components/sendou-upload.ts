/**
 * "Upload to sendou.ink" link for a fully processed VoD: the detected events
 * are built into ScannerMatches (core/match-builder.ts), projected onto the
 * slim per-match rows the `ingest` search param of sendou.ink's /vods/new
 * form carries (an `SP.json` param the search-params module compresses),
 * which prefills a new VoD from them (the user adds the YouTube
 * URL/title/date and fixes any misreads before submitting).
 *
 * The VoD type is auto-detected: footage containing the casted 8-player
 * spectator map screen is a CAST VoD; anything else leaves the form's default
 * type untouched. A match without a mode read prefills the form's SZ default,
 * flagged `modeAssumed` — the fabricated default lives here, not on
 * ScannerMatch.
 */
import type {
	IngestVodMatchInput,
	IngestVodPrefill,
} from "~/features/scanner-ingest/scanner-ingest-vod-schemas";
import { vodsNewSearchParams } from "~/features/vods/vods-search-params";
import { newVodPage } from "~/features/vods/vods-urls";
import type { MainWeaponId, ModeShort } from "~/modules/in-game-lists/types";
import type { DetectedEvent } from "../core/detectors/types";
import { buildScannerMatches } from "../core/match-builder";
import type { ScannerMatch } from "../core/scanner-match";

/**
 * GET query params ride the request line, and servers/proxies commonly cap
 * that around 8-16 KB. A VoD long enough to blow past this needs a POST
 * flow, which /vods/new doesn't offer yet — surface that instead of
 * emitting a URL the server would reject with an opaque error.
 */
const MAX_URL_LENGTH = 8000;

/** The prefill default for a match whose mode no source read. */
const DEFAULT_VOD_MODE = "SZ" satisfies ModeShort;

export interface SendouUpload {
	/** prefilled /vods/new path (same-origin); null when nothing usable to send */
	url: string | null;
	/** set when matches exist but no usable URL could be built */
	problem: string | null;
}

/** Builds the prefilled /vods/new link for a completed scan's events. */
export function sendouUpload(events: readonly DetectedEvent[]): SendouUpload {
	const matches = buildScannerMatches(events)
		.map((built) => built.match)
		.filter((match) => match.teams.some((team) => team.players.length > 0));
	if (matches.length === 0) return { url: null, problem: null };

	const isCast = matches.some((match) => match.cast);

	const payload: IngestVodPrefill = {
		...(isCast ? { type: "CAST" as const } : null),
		matches: matches.map(toPrefillMatch),
	};
	const result = vodsNewSearchParams.href(newVodPage(), { ingest: payload });
	if (result.length > MAX_URL_LENGTH) {
		return {
			url: null,
			problem:
				`prefill URL is ${result.length} chars (limit ~${MAX_URL_LENGTH}) — ` +
				"too many matches for a GET query param.",
		};
	}
	return { url: result, problem: null };
}

function toPrefillMatch(match: ScannerMatch): IngestVodMatchInput {
	return {
		startsAt: match.startsAt ?? 0,
		mode: match.mode ?? DEFAULT_VOD_MODE,
		modeAssumed: match.mode === null,
		stage: match.stage,
		// /vods/new splits this at a fixed 4 slots per team, so pad short rosters
		weapons: match.teams.flatMap((team) =>
			Array.from({ length: 4 }, (_, i) => team.players[i]?.weaponId ?? null),
		),
		povWeapon: povWeaponId(match),
	};
}

function povWeaponId(match: ScannerMatch): MainWeaponId | undefined {
	if (!match.pov) return undefined;

	return (
		match.teams[match.pov.team].players[match.pov.index]?.weaponId ?? undefined
	);
}
