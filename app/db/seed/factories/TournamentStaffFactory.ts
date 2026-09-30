import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = {
	tournamentId: number;
	userId: number;
	role: Parameters<
		typeof TournamentRepository.setStaff
	>[0]["staff"][number]["role"];
};

/** Adds one staff member on top of the tournament's existing staff, as the admin staff page saves them. */
export const { create } = defineFactory({
	defaults: () => ({ role: "ORGANIZER" as const }),
	insert: async (args: InsertArgs) => {
		const tournament = await TournamentRepository.findById(args.tournamentId);

		await TournamentRepository.setStaff({
			tournamentId: args.tournamentId,
			staff: [
				...(tournament?.staff ?? []).map((staffer) => ({
					userId: staffer.id,
					role: staffer.role,
				})),
				{ userId: args.userId, role: args.role },
			],
		});

		return { tournamentId: args.tournamentId, userId: args.userId };
	},
});
