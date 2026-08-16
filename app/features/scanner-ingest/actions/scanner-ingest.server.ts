import { subDays } from "date-fns";
import type { ActionFunction } from "react-router";
import { Config } from "~/config";
import { requireUser } from "~/features/auth/core/user.server";
import type { ScannerMatch } from "~/features/scanner/core/scanner-match";
import { isAdmin, isDev, isScannerTester } from "~/modules/permissions/utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { forbidden, parseBody } from "~/utils/remix.server";
import * as Scoreboards from "../core/Scoreboards";
import * as ScannerIngestRepository from "../ScannerIngestRepository.server";
import {
	type IngestedMatchLink,
	type IngestResponse,
	ingestBodySchema,
} from "../scanner-ingest-schemas";

/**
 * How far back the POV user's reported games are considered as content-
 * resolution candidates
 */
const CONTENT_RESOLUTION_WINDOW_DAYS = 365;

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	if (
		!Config.scannerEnabled &&
		!isAdmin(user) &&
		!isDev(user) &&
		!isScannerTester(user)
	) {
		forbidden();
	}

	const data = await parseBody({ request, schema: ingestBodySchema });

	const povUserId = user.id;

	const indexedMatches = data.matches
		.map((match, requestIndex) => ({
			match: withoutDisprovenCast(match),
			requestIndex,
		}))
		.filter(({ match }) => match.lobby === null || match.lobby === "PRIVATE");
	const matches = indexedMatches.map(({ match }) => match);
	if (matches.length === 0) {
		return {
			storedMatchesCount: 0,
			mergedMatchesCount: 0,
			linkedGamesCount: 0,
			linkedMatches: [],
			contextResolved: false,
		} satisfies IngestResponse;
	}

	const resolved = await resolveIngestContext({
		matches,
		povUserId,
		casterUserId: user.id,
	});

	const { insertedCount, mergedCount, effectiveMatches } =
		await ScannerIngestRepository.addOrMergeMatches({
			povUserId,
			submitterUserId: user.id,
			matches,
			context: resolved?.context ?? null,
		});

	let linkedGamesCount = 0;
	let linkedMatches: IngestResponse["linkedMatches"] = [];
	if (resolved) {
		const matched = Scoreboards.matchedGames({
			matches: effectiveMatches.map((effective) => effective.data),
			games: resolved.games,
			povUserId,
		});

		linkedGamesCount = await ScannerIngestRepository.addLinks({
			links: matched.map(({ matchIndex, game }) => ({
				ingestedMatchId: effectiveMatches[matchIndex]!.id,
				match: effectiveMatches[matchIndex]!.data,
				game,
			})),
			povUserId,
		});

		linkedMatches = matched.map(({ matchIndex, game }) => ({
			matchIndex: indexedMatches[matchIndex]!.requestIndex,
			link: ingestedMatchLink(resolved.context, game.target),
		}));

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
		linkedMatches,
		contextResolved: resolved !== null,
	} satisfies IngestResponse;
};

function ingestedMatchLink(
	context: Scoreboards.IngestContext,
	target: Scoreboards.IngestableGameTarget,
): IngestedMatchLink {
	if (target.type === "tournament" && context.type === "tournament") {
		return {
			type: "tournament",
			tournamentId: context.tournamentId,
			matchId: target.tournamentMatchId,
		};
	}
	if (target.type === "sendouq") {
		return { type: "sendouq", groupMatchId: target.groupMatchId };
	}
	throw new Error("ingest link target does not match its resolved context");
}

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

		const tournamentActivity =
			await ScannerIngestRepository.tournamentActivityAt({
				userId: povUserId,
				at,
			});
		if (tournamentActivity) {
			const { tournamentId, tournamentMatchId } = tournamentActivity;
			addCandidate({
				context: { type: "tournament", tournamentId },
				loadGames: () =>
					// a live send carries a single match, so the mode+stage order
					// that anchors a whole scan is absent and the walk would take
					// the first free game on that map anywhere in the tournament —
					// some earlier round's. Only the set being played can be meant.
					matches.length === 1
						? ScannerIngestRepository.gamesInTournamentMatch(tournamentMatchId)
						: ScannerIngestRepository.gamesPlayedByUserInTournament({
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
		const matched = Scoreboards.matchedGames({
			matches,
			games,
			povUserId,
		}).length;
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
		const since = dateToDatabaseTimestamp(
			subDays(new Date(), CONTENT_RESOLUTION_WINDOW_DAYS),
		);
		const games = (
			await Promise.all([
				ScannerIngestRepository.gamesPlayedByUserSince({
					userId: povUserId,
					since,
				}),
				ScannerIngestRepository.sendouqGamesPlayedByUserSince({
					userId: povUserId,
					since,
				}),
			])
		).flat();
		const context = Scoreboards.resolveContext({ matches, games, povUserId });
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
 * A results-screen POV seat disproves the cast flag — casts never see a
 * results screen — so a misflagged read still resolves through the sender's
 * own activity.
 */
function withoutDisprovenCast(match: ScannerMatch): ScannerMatch {
	if (!match.cast || match.pov === null) return match;

	return { ...match, cast: false };
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
