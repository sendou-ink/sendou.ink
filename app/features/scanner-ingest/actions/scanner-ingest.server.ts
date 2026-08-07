import { subDays } from "date-fns";
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

	const matches = data.matches.filter(
		(match) => match.lobby === null || match.lobby === "PRIVATE",
	);
	if (matches.length === 0) {
		return {
			storedMatchesCount: 0,
			mergedMatchesCount: 0,
			linkedGamesCount: 0,
		};
	}

	const resolved = await resolveIngestContext({
		matches,
		povUserId,
		casterUserId: user?.id ?? null,
	});

	const { insertedCount, mergedCount, effectiveMatches } =
		await ScannerIngestRepository.addOrMergeMatches({
			povUserId,
			submitterUserId: user?.id ?? null,
			matches,
			context: resolved?.context ?? null,
		});

	let linkedGamesCount = 0;
	if (resolved) {
		const matched = Scoreboards.matchedGames({
			matches: effectiveMatches.map((effective) => effective.data),
			games: resolved.games,
		});

		linkedGamesCount = await ScannerIngestRepository.addLinks({
			links: matched.map(({ matchIndex, game }) => ({
				ingestedMatchId: effectiveMatches[matchIndex]!.id,
				match: effectiveMatches[matchIndex]!.data,
				game,
			})),
			povUserId,
		});

		logger.debug(
			`ingest: ${Scoreboards.contextKey(resolved.context)} matched ${matched.length} games, ` +
				`${linkedGamesCount} newly linked (stored ${insertedCount}, merged ${mergedCount})`,
		);
	} else {
		logger.debug(
			`ingest: stored ${insertedCount} matches (${mergedCount} merged) without a resolved context ` +
				`(povUserId=${povUserId})`,
		);
	}

	return {
		storedMatchesCount: insertedCount,
		mergedMatchesCount: mergedCount,
		linkedGamesCount,
	};
};

/**
 * How far back the POV user's reported games are considered as content-
 * resolution candidates
 */
const CONTENT_RESOLUTION_WINDOW_DAYS = 365;

interface ResolvedIngestContext {
	context: Scoreboards.IngestContext;
	games: Scoreboards.IngestableGameWithContext[];
}

interface IngestContextCandidate {
	context: Scoreboards.IngestContext;
	loadGames: () => Promise<Scoreboards.IngestableGameWithContext[]>;
}

/**
 * Resolves the context (tournament or SendouQ match) a request's matches
 * belong to.
 *
 * The user's activity around the time the matches were played is the strong
 * signal: the SendouQ match resp. tournament match of theirs running then
 * (for cast footage, the casted sets of tournaments the submitter helps
 * run as author/organizer/streamer). Candidates are scored by how many
 * matches would link to their games; a candidate is kept even when nothing links
 * yet (a live minimap-only match still gets its hint). With no activity,
 * the matches' content decides: the mode+stage sequence plus roster sides
 * is near-unique in a user's reported-game history.
 */
async function resolveIngestContext({
	matches,
	povUserId,
	casterUserId,
}: {
	matches: ScannerMatch[];
	povUserId: number | null;
	casterUserId: number | null;
}): Promise<ResolvedIngestContext | null> {
	const at = anchorTime(matches);
	const hasPovMatches = matches.some((match) => !match.cast);
	const hasCastMatches = matches.some((match) => match.cast);

	const candidates: IngestContextCandidate[] = [];
	const seenContexts = new Set<string>();
	const addCandidate = (candidate: IngestContextCandidate) => {
		const key = Scoreboards.contextKey(candidate.context);
		if (seenContexts.has(key)) return;
		seenContexts.add(key);
		candidates.push(candidate);
	};

	if (povUserId && hasPovMatches) {
		const groupMatchId = await ScannerIngestRepository.groupMatchIdAt({
			userId: povUserId,
			at,
		});
		if (groupMatchId) {
			addCandidate({
				context: { type: "sendouq", groupMatchId },
				loadGames: () =>
					ScannerIngestRepository.gamesInGroupMatch(groupMatchId),
			});
		}

		const tournamentId = await ScannerIngestRepository.tournamentIdAt({
			userId: povUserId,
			at,
		});
		if (tournamentId) {
			addCandidate({
				context: { type: "tournament", tournamentId },
				loadGames: () =>
					ScannerIngestRepository.gamesPlayedByUserInTournament({
						userId: povUserId,
						tournamentId,
					}),
			});
		}
	}

	if (casterUserId && hasCastMatches) {
		const staffTournamentIds =
			await ScannerIngestRepository.staffTournamentIdsAt({
				userId: casterUserId,
				at,
			});
		for (const tournamentId of staffTournamentIds) {
			addCandidate({
				context: { type: "tournament", tournamentId },
				loadGames: () =>
					ScannerIngestRepository.castedGamesInTournament(tournamentId),
			});
		}
	}

	let best: {
		candidate: IngestContextCandidate;
		games: Scoreboards.IngestableGameWithContext[];
		matched: number;
	} | null = null;
	for (const candidate of candidates) {
		const games = await candidate.loadGames();
		const matched = Scoreboards.matchedGames({ matches, games }).length;
		if (!best || matched > best.matched) {
			best = { candidate, games, matched };
		}
	}
	if (best) {
		logger.debug(
			`ingest: resolved ${Scoreboards.contextKey(best.candidate.context)} for user ${povUserId} ` +
				`from activity at ${new Date(at).toISOString()} (${best.matched} matches aligned, ${candidates.length} candidates)`,
		);
		return {
			context: best.candidate.context,
			games: best.games,
		};
	}

	if (povUserId && hasPovMatches && countAttachableMatches(matches) >= 2) {
		const since = Math.floor(
			subDays(new Date(), CONTENT_RESOLUTION_WINDOW_DAYS).getTime() / 1000,
		);
		const games = [
			...(await ScannerIngestRepository.gamesPlayedByUserSince({
				userId: povUserId,
				since,
			})),
			...(await ScannerIngestRepository.sendouqGamesPlayedByUserSince({
				userId: povUserId,
				since,
			})),
		];
		const context = Scoreboards.resolveContext({ matches, games });
		if (context) {
			const key = Scoreboards.contextKey(context);
			logger.debug(
				`ingest: resolved ${key} for user ${povUserId} from match contents ` +
					`(${games.length} candidate games)`,
			);
			return {
				context,
				games: games.filter(
					(game) => Scoreboards.contextKey(game.context) === key,
				),
			};
		}
	}

	logger.debug(
		`ingest: no context for user ${povUserId} at ${new Date(at).toISOString()}`,
	);
	return null;
}

/** Matches that could link to a reported game: their winner is known. */
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
