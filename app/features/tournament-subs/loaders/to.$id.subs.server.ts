import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import { tournamentIdFromParams } from "~/features/tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { assertUnreachable } from "~/utils/types";
import { tournamentRegisterPage } from "~/utils/urls";
import { findSubsByTournamentId } from "../queries/findSubsByTournamentId.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const tournamentId = tournamentIdFromParams(params);

	const tournament = await tournamentFromDB({ tournamentId, user });
	if (!tournament.subsFeatureEnabled) {
		throw redirect(tournamentRegisterPage(tournamentId));
	}

	const subs = findSubsByTournamentId({
		tournamentId,
		userId: user?.id,
	}).filter((sub) => {
		if (sub.visibility === "ALL") return true;

		const userPlusTier = user?.plusTier ?? 4;

		switch (sub.visibility) {
			case "+1": {
				return userPlusTier === 1;
			}
			case "+2": {
				return userPlusTier <= 2;
			}
			case "+3": {
				return userPlusTier <= 3;
			}
			default: {
				assertUnreachable(sub.visibility);
			}
		}
	});

	return {
		subs,
		hasOwnSubPost: subs.some((sub) => sub.userId === user?.id),
	};
};
