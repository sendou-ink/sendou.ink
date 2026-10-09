import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { adminStaffFormSchemaServer } from "../tournament-admin-schemas";

export const action = defineAction(
	{
		body: async ({ params }) => {
			const { tournament } = await tournamentFromParams(params, {
				for: "admin",
			});

			return adminStaffFormSchemaServer({ tournament });
		},
	},
	async ({ params, body }) => {
		const { tournament, tournamentId } = await tournamentFromParams(params, {
			for: "admin",
		});

		const submittedStaff = body.staff;

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
	},
);
