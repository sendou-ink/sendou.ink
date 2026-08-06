import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	tournamentFromParams,
	tournamentTeamsFullInSeedOrder,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "organizer" },
	);

	const teams = await tournamentTeamsFullInSeedOrder({ tournament, user });

	const userIds = R.unique(
		teams.flatMap((team) => team.members.map((member) => member.userId)),
	);

	return {
		teams,
		seedingSnapshot:
			await TournamentRepository.findSeedingSnapshotById(tournamentId),
		...(await UserCardRepository.findAllByUserIds({
			userIds,
		})),
	};
};
