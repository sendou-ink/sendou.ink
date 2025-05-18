import { type ActionFunction, redirect } from "@remix-run/node";
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
import { tournamentSubsPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import { upsertSub } from "../queries/upsertSub.server";
import { subSchema } from "../tournament-subs-schemas.server";

export const action: ActionFunction = async ({ params, request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: subSchema,
	});
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	errorToastIfFalsy(!tournament.everyBracketOver, "Tournament is over");
	errorToastIfFalsy(
		tournament.canAddNewSubPost,
		"Registration is closed or subs feature disabled",
	);
	errorToastIfFalsy(
		!tournament.teamMemberOfByUser(user),
		"Can't register as a sub and be in a team at the same time",
	);

	upsertSub({
		bestWeapons: data.bestWeapons.join(","),
		okWeapons: data.okWeapons.join(","),
		canVc: data.canVc,
		visibility: data.visibility,
		message: data.message ?? null,
		tournamentId,
		userId: user.id,
	});

	clearTournamentDataCache(tournamentId);

	throw redirect(tournamentSubsPage(tournamentId));
};
