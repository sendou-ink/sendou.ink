import type { ActionFunction } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { deleteSub } from "../queries/deleteSub.server";
import { deleteSubSchema } from "../tournament-subs-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUser(request);
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });
	const data = await parseRequestPayload({
		request,
		schema: deleteSubSchema,
	});

	errorToastIfFalsy(
		user.id === data.userId || tournament.isOrganizer(user),
		"You can only delete your own sub post",
	);

	deleteSub({
		tournamentId,
		userId: data.userId,
	});

	clearTournamentDataCache(tournamentId);

	return null;
};
