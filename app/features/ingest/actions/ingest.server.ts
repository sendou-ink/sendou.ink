import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import {
	badRequestIfFalsy,
	canAccessLohiEndpoint,
	parseBody,
} from "~/utils/remix.server";
import * as Scoreboards from "../core/Scoreboards";
import * as IngestRepository from "../IngestRepository.server";
import { type IngestedEventInput, ingestBodySchema } from "../ingest-schemas";

// xxx: dont only attach scoreboard on ingest, also when score is reported (for e.g. tournament stuff)
// xxx: check why http://localhost:7001/to/4066/matches/139247?tab=result layout bad
// xxx: check why http://localhost:7001/to/4066/matches/139247?tab=result first game not uploaded
export const action: ActionFunction = async ({ request }) => {
	const user = canAccessLohiEndpoint(request) ? null : requireUser();

	const data = await parseBody({ request, schema: ingestBodySchema });

	const povUserId = data.povUserId ?? user?.id ?? null;

	if (povUserId) {
		badRequestIfFalsy(await UserRepository.findLeanById(povUserId));
	}

	let tournamentId = data.tournamentId ?? null;
	if (tournamentId) {
		badRequestIfFalsy(await IngestRepository.tournamentStartTime(tournamentId));
	} else if (povUserId) {
		// no explicit tournament: resolve from when the events' match was
		// played (a replay scoreboard carries the original recording time)
		const at = anchorTime(data.events);
		tournamentId = await IngestRepository.tournamentIdAt({
			userId: povUserId,
			at,
		});
		logger.debug(
			tournamentId
				? `ingest: resolved tournament ${tournamentId} for user ${povUserId} from timestamp ${new Date(at).toISOString()}`
				: `ingest: no tournament for user ${povUserId} at ${new Date(at).toISOString()} (no tournament match of theirs started around then)`,
		);
	}

	const storedEventsCount = await IngestRepository.addEvents({
		tournamentId,
		povUserId,
		submitterUserId: user?.id ?? null,
		events: data.events,
	});

	let storedScoreboardsCount = 0;
	if (tournamentId && povUserId) {
		const games = await IngestRepository.gamesPlayedByUserInTournament({
			userId: povUserId,
			tournamentId,
		});

		const matched = Scoreboards.matchedScoreboards({
			events: data.events,
			games,
		});

		storedScoreboardsCount = await IngestRepository.addScoreboards({
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
			`ingest: stored ${storedEventsCount} events without a match context ` +
				`(tournamentId=${tournamentId}, povUserId=${povUserId})`,
		);
	}

	return { storedEventsCount, storedScoreboardsCount };
};

/**
 * The wall-clock time the events' match was (probably) played: the latest
 * scoreboard's recording time (replays) or detection time, falling back to
 * any event's detection time and finally to "now".
 */
function anchorTime(events: IngestedEventInput[]): number {
	const anchors = events
		.filter(
			(event) =>
				event.type === "Scoreboard" || event.type === "ScoreboardReplay",
		)
		.map(
			(event) =>
				(event.type === "ScoreboardReplay" ? event.recordedAt : null) ??
				event.detectedAt,
		)
		.filter(
			(anchor): anchor is number => anchor !== undefined && anchor !== null,
		);
	if (anchors.length > 0) return Math.max(...anchors);

	const detections = events
		.map((event) => event.detectedAt)
		.filter((detectedAt): detectedAt is number => detectedAt !== undefined);
	if (detections.length > 0) return Math.max(...detections);

	return Date.now();
}
