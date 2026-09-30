/**
 * "Upload to sendou.ink" link for a fully processed VoD: the events are built
 * into ScannerMatches and projected onto the slim per-match rows the `ingest`
 * search param of /vods/new carries (an `SP.json` param), which prefills a
 * new VoD (the user adds URL/title/date and fixes misreads). Footage with the
 * casted 8-player spectator map screen is a CAST VoD; anything else keeps the
 * form's default type. A match without a mode read prefills the SZ default,
 * flagged `modeAssumed` — the fabricated default lives here, not on ScannerMatch.
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
 * Servers/proxies commonly cap the request line around 8-16 KB; a VoD long
 * enough to blow past this needs a POST flow /vods/new doesn't offer yet, so
 * surface that instead of emitting a URL the server rejects opaquely.
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
