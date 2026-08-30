import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as RegistrationAvailability from "~/features/availability/core/RegistrationAvailability.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "view" },
	);
	if (!user) return null;

	const teamMemberOf = tournament.teamMemberOfByUser(user);
	const friendPlayers = await SQGroupRepository.findFriendsAndTeammates(
		user.id,
	);
	const [availability, teams] = await Promise.all([
		rosterAvailability({
			tournament,
			userId: user.id,
			friendIds: friendPlayers.friends.map((friend) => friend.id),
		})?.catch((error) => {
			logger.error("Failed to resolve registration availability", error);
			return null;
		}) ?? null,
		TeamRepository.findAllMemberOfByUserId(user.id),
	]);

	if (!teamMemberOf) {
		return {
			ownTeam: null,
			mapPool: null,
			friendPlayers,
			availability,
			teams,
			isSaved: await SavedCalendarEventRepository.isSaved({
				userId: user.id,
				tournamentId,
			}),
		};
	}

	const ownTeam =
		(await tournamentTeamsFullCached({ tournamentId, user })).find(
			(team) => team.id === teamMemberOf.id,
		) ?? null;

	return {
		ownTeam,
		mapPool: ownTeam?.mapPool ?? null,
		friendPlayers,
		availability,
		teams,
		isSaved: false,
	};
};

function rosterAvailability({
	tournament,
	userId,
	friendIds,
}: {
	tournament: Tournament;
	userId: number;
	friendIds: Array<number>;
}) {
	if (tournament.isLeague) return null;

	const startsAt = dateToDatabaseTimestamp(tournament.ctx.startsAt);
	if (tournament.ctx.startsAt <= new Date()) return null;

	return RegistrationAvailability.registrationAvailability({
		tournament: {
			id: tournament.ctx.id,
			name: tournament.ctx.name,
			organizationId: tournament.ctx.organization?.id ?? null,
			startsAt,
			minMembersPerTeam: tournament.minMembersPerTeam,
			bracketTypes: tournament.ctx.settings.bracketProgression.map(
				(bracket) => bracket.type,
			),
			teamCount: tournament.ctx.teams.length,
		},
		userIds: R.unique([userId, ...friendIds]),
		timezone: getViewerTimezone() ?? "UTC",
	});
}

export type TournamentRegisterPageLoader = typeof loader;
