import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	requireTournamentOrganizer,
	tournamentSharedCached,
	tournamentTeamsFullInSeedOrder,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentSharedCached(tournamentId);
	requireTournamentOrganizer({ tournament, user });

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
