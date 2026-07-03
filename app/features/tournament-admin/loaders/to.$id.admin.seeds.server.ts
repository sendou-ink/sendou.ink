import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentFromDBCached({
		tournamentId,
		user: undefined,
	});

	const userIds = R.unique(
		tournament.ctx.teams.flatMap((team) =>
			team.members.map((member) => member.userId),
		),
	);

	return {
		...(await UserCardRepository.userCards({
			userIds,
		})),
	};
};
