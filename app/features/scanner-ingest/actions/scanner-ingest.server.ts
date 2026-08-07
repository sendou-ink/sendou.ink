import type { ActionFunction } from "react-router";
import { Config } from "~/config";
import { requireUser } from "~/features/auth/core/user.server";
import type { ScannerMatch } from "~/features/scanner/core/scanner-match";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isAdmin } from "~/modules/permissions/utils";
import { logger } from "~/utils/logger";
import { badRequestIfFalsy, forbidden, parseBody } from "~/utils/remix.server";
import * as Scoreboards from "../core/Scoreboards";
import * as ScannerIngestRepository from "../ScannerIngestRepository.server";
import { ingestBodySchema } from "../scanner-ingest-schemas";

// xxx: dont only attach scoreboard on ingest, also when score is reported (for e.g. tournament stuff)
// xxx: check why http://localhost:7001/to/4066/matches/139247?tab=result layout bad
// xxx: check why http://localhost:7001/to/4066/matches/139247?tab=result first game not uploaded
// xxx: this needs some thinking and documentation to cover all the cases that can be ingested
export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	if (!Config.scannerEnabled && !isAdmin(user)) {
		forbidden();
	}

	const data = await parseBody({ request, schema: ingestBodySchema });

	const povUserId = data.povUserId ?? user?.id ?? null;

	if (povUserId) {
		badRequestIfFalsy(await UserRepository.findLeanById(povUserId));
	}

	// xxx: also pass if the ingestion is live footage, if so then check users current activity and use that info instead (can/should also be persisted?)
	let tournamentId = data.tournamentId ?? null;
	// the resolving content walk's candidate games, kept so the scoreboard
	// matching below doesn't re-query them
	let candidateGames: Scoreboards.IngestableGameWithTournament[] | null = null;
	if (tournamentId) {
		badRequestIfFalsy(
			await ScannerIngestRepository.tournamentStartTime(tournamentId),
		);
	} else if (povUserId) {
		// no explicit tournament: resolve from the matches' content first (the
		// mode+stage sequence plus roster sides is near-unique in a user's
		// history), then from when the match was played (a replay scoreboard
		// carries the original recording time). Single-match requests (live
		// sends) skip straight to the timestamp — content resolution needs a
		// sequence to be decisive.
		if (countAttachableMatches(data.matches) >= 2) {
			const games = await ScannerIngestRepository.gamesPlayedByUserSince({
				userId: povUserId,
				since:
					// xxx: use date-fns
					Math.floor(Date.now() / 1000) - CONTENT_RESOLUTION_WINDOW_SECONDS,
			});
			tournamentId = Scoreboards.resolveTournamentId({
				matches: data.matches,
				games,
			});
			if (tournamentId) {
				candidateGames = games;
				logger.debug(
					`ingest: resolved tournament ${tournamentId} for user ${povUserId} from match contents ` +
						`(${games.length} candidate games)`,
				);
			}
		}
		if (!tournamentId) {
			const at = anchorTime(data.matches);
			tournamentId = await ScannerIngestRepository.tournamentIdAt({
				userId: povUserId,
				at,
			});
			logger.debug(
				tournamentId
					? `ingest: resolved tournament ${tournamentId} for user ${povUserId} from timestamp ${new Date(at).toISOString()}`
					: `ingest: no tournament for user ${povUserId} at ${new Date(at).toISOString()} (no tournament match of theirs started around then)`,
			);
		}
	}

	const { insertedCount, mergedCount, effectiveMatches } =
		await ScannerIngestRepository.addOrMergeMatches({
			tournamentId,
			povUserId,
			submitterUserId: user?.id ?? null,
			matches: data.matches,
		});

	let storedScoreboardsCount = 0;
	if (tournamentId && povUserId) {
		const resolvedTournamentId = tournamentId;
		const games = candidateGames
			? candidateGames.filter(
					(game) => game.tournamentId === resolvedTournamentId,
				)
			: await ScannerIngestRepository.gamesPlayedByUserInTournament({
					userId: povUserId,
					tournamentId,
				});

		const matched = Scoreboards.matchedScoreboards({
			matches: effectiveMatches,
			games,
		});

		storedScoreboardsCount = await ScannerIngestRepository.addScoreboards({
			scoreboards: matched,
			povUserId,
		});

		logger.debug(
			matched.length > 0
				? `ingest: matched ${matched.length} scoreboards in tournament ${tournamentId} to ` +
						`[${matched.map((m) => `match ${m.tournamentMatchId} map ${m.mapIndex + 1}`).join(", ")}], ` +
						`${storedScoreboardsCount} newly stored`
				: `ingest: no scoreboards matched in tournament ${tournamentId} — user ${povUserId} has ` +
						`${games.length} reported games there`,
		);
	} else {
		logger.debug(
			`ingest: stored ${insertedCount} matches (${mergedCount} merged) without a match context ` +
				`(tournamentId=${tournamentId}, povUserId=${povUserId})`,
		);
	}

	return {
		storedMatchesCount: insertedCount,
		mergedMatchesCount: mergedCount,
		storedScoreboardsCount,
	};
};

/**
 * How far back the POV user's reported games are considered as content-
 * resolution candidates (365 days)
 */
const CONTENT_RESOLUTION_WINDOW_SECONDS = 365 * 24 * 60 * 60;

/** Matches that could attach to a tournament game: their winner is known. */
function countAttachableMatches(matches: ScannerMatch[]): number {
	return matches.filter((match) => match.winner !== null).length;
}

/**
 * The wall-clock time the request's matches were (probably) played: the
 * latest match's playedAt, falling back to "now".
 */
function anchorTime(matches: ScannerMatch[]): number {
	const playedAts = matches
		.map((match) => match.playedAt)
		.filter((playedAt): playedAt is number => playedAt !== null);
	if (playedAts.length > 0) return Math.max(...playedAts);

	return Date.now();
}
