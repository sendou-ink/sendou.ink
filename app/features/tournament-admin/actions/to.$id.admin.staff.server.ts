import type { ActionFunction } from "react-router";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { parseFormData } from "~/form/parse.server";
import { adminStaffFormSchemaServer } from "../tournament-admin-schemas";

export const action: ActionFunction = async ({ request, params }) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "admin",
	});

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
