import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { parseFormData } from "~/form/parse.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "../../../utils/zod";
import { adminStaffFormSchemaServer } from "../tournament-admin-schemas.server";
import { requireTournamentAdmin } from "../tournament-admin-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	requireTournamentAdmin(tournament, user);

	const result = await parseFormData({
		request,
		schema: adminStaffFormSchemaServer({ tournament }),
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}
	const submittedStaff = result.data.staff;

	const currentOrganizerIds = tournament.ctx.staff
		.filter((staffer) => staffer.role === "ORGANIZER")
		.map((staffer) => staffer.id);
	const submittedOrganizerIds = submittedStaff
		.filter((staffer) => staffer.role === "ORGANIZER")
		.map((staffer) => staffer.userId);

	await TournamentRepository.setStaff({
		tournamentId,
		staff: submittedStaff.map((staffer) => ({
			userId: staffer.userId,
			role: staffer.role,
		})),
	});

	for (const userId of submittedOrganizerIds.filter(
		(id) => !currentOrganizerIds.includes(id),
	)) {
		ShowcaseTournaments.addToCached({
			tournamentId,
			type: "organizer",
			userId,
		});
	}
	for (const userId of currentOrganizerIds.filter(
		(id) => !submittedOrganizerIds.includes(id),
	)) {
		ShowcaseTournaments.removeFromCached({
			tournamentId,
			type: "organizer",
			userId,
		});
	}

	clearTournamentDataCache(tournamentId);

	return null;
};
