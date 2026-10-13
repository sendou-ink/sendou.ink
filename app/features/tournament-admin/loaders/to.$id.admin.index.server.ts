import type { LoaderFunctionArgs } from "react-router";
import {
	tournamentFromParams,
	tournamentTeamsFullInSeedOrder,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";

export type TournamentAdminTeamsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "organizer",
	});

	const teams = await tournamentTeamsFullInSeedOrder({ tournament, user });
	const discordIds = await UserRepository.findDiscordIdsByUserIds(
		teams.flatMap((team) => team.members.map((member) => member.userId)),
	);

	return {
		teams,
		memberDiscordIds: Object.fromEntries(discordIds),
	};
};
