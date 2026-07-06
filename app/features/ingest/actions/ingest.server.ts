import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	badRequestIfFalsy,
	canAccessLohiEndpoint,
	parseBody,
} from "~/utils/remix.server";
import * as Scoreboards from "../core/Scoreboards";
import * as IngestRepository from "../IngestRepository.server";
import { ingestBodySchema } from "../ingest-schemas";

export const action: ActionFunction = async ({ request }) => {
	const user = canAccessLohiEndpoint(request) ? null : requireUser();

	const data = await parseBody({ request, schema: ingestBodySchema });

	const povUserId = data.povUserId ?? user?.id ?? null;
	const tournamentId = data.tournamentId ?? null;

	if (povUserId) {
		badRequestIfFalsy(await UserRepository.findLeanById(povUserId));
	}
	if (tournamentId) {
		badRequestIfFalsy(await IngestRepository.tournamentStartTime(tournamentId));
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

		storedScoreboardsCount = await IngestRepository.addScoreboards({
			scoreboards: Scoreboards.matchedScoreboards({
				events: data.events,
				games,
			}),
			povUserId,
		});
	}

	return { storedEventsCount, storedScoreboardsCount };
};
