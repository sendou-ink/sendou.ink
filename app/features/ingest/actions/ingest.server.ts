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
	const tournamentStartTime = tournamentId
		? badRequestIfFalsy(
				await IngestRepository.tournamentStartTime(tournamentId),
			)
		: null;

	const storedEventsCount = await IngestRepository.addEvents({
		tournamentId,
		povUserId,
		submitterUserId: user?.id ?? null,
		events: data.events,
	});

	let reportedWeaponsCount = 0;
	if (tournamentId && tournamentStartTime && povUserId) {
		const games = await IngestRepository.gamesPlayedByUserInTournament({
			userId: povUserId,
			tournamentId,
		});

		reportedWeaponsCount = await IngestRepository.addReportedWeapons(
			Scoreboards.reportedWeaponRowsFromEvents({
				events: data.events,
				games,
				// xxx: why createdAt here? makes no sense
				createdAt: tournamentStartTime,
			}),
		);
	}

	return { storedEventsCount, reportedWeaponsCount };
};
