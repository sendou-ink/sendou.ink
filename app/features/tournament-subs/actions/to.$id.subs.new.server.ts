import { type ActionFunction, redirect } from "react-router";
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
import * as TournamentSubRepository from "../TournamentSubRepository.server";
import { subSchema } from "../tournament-subs-schemas.server";

export const action: ActionFunction = async ({ params, request }) => {
	const user = await requireUser();
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

	await TournamentSubRepository.upsert({
		bestWeapons: data.bestWeapons,
		okWeapons: data.okWeapons,
		canVc: data.canVc,
		visibility: data.visibility,
		message: data.message ?? null,
		tournamentId,
		userId: user.id,
	});

	clearTournamentDataCache(tournamentId);

	throw redirect(tournamentSubsPage(tournamentId));
};
