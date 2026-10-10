import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import * as ScannerIngestRepository from "../ScannerIngestRepository.server";
import * as Scoreboards from "./Scoreboards";

type ReportedMatch =
	| { type: "tournament"; tournamentId: number; tournamentMatchId: number }
	| { type: "sendouq"; groupMatchId: number };

/**
 * Links stored matches to a game reported just now. Senders stop resending once sendou.ink has
 * stored a match, so a scan that beat the report (or lost its link to a corrected one) would
 * otherwise never link. Only matches hinted to the reported match's context and played recently
 * enough to be its game are considered, and only that match's games are candidates. Failures are
 * logged, never thrown: the report itself already went through.
 */
export async function linkStoredMatches(reported: ReportedMatch) {
	try {
		const stored = await ScannerIngestRepository.findUnlinkedMatchesByHint({
			context:
				reported.type === "tournament"
					? { type: "tournament", tournamentId: reported.tournamentId }
					: { type: "sendouq", groupMatchId: reported.groupMatchId },
			playedSince: dateToDatabaseTimestamp(
				new Date(Date.now() - Scoreboards.PLAYED_AT_TOLERANCE_MS),
			),
		});

		// sides are pinned by the sender's seat, so each sender's scans match on their own
		const byPovUserId = new Map<number | null, typeof stored>();
		for (const match of stored) {
			byPovUserId.set(match.povUserId, [
				...(byPovUserId.get(match.povUserId) ?? []),
				match,
			]);
		}

		for (const [povUserId, matches] of byPovUserId) {
			// reloaded per sender: an earlier sender's links mark games as taken
			const games =
				reported.type === "tournament"
					? await ScannerIngestRepository.gamesInTournamentMatches([
							reported.tournamentMatchId,
						])
					: await ScannerIngestRepository.gamesInGroupMatch(
							reported.groupMatchId,
						);
			const matched = Scoreboards.matchedGames({
				matches: matches.map((match) => match.data),
				games,
				povUserId,
			});
			if (matched.length === 0) continue;

			await ScannerIngestRepository.addLinks({
				links: matched.map(({ matchIndex, game }) => ({
					ingestedMatchId: matches[matchIndex]!.id,
					match: matches[matchIndex]!.data,
					game,
				})),
				povUserId,
			});
		}
	} catch (error) {
		logger.error("Linking stored scanner matches failed", error);
	}
}
