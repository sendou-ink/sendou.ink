import * as v from "valibot";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { superRefineAsync } from "~/utils/schema";
import { registerTeamFormSchema } from "./tournament-register-schemas";
import { tournamentTeamNameTaken } from "./tournament-utils.server";

/** {@link registerTeamFormSchema} plus the server-only unique name check ({@link tournamentTeamNameTaken}) as a field error. */
export function registerTeamFormSchemaServer({
	tournament,
	ownTeamId,
}: {
	tournament: Tournament;
	/** The team the registering user already owns, excluded from the uniqueness check. */
	ownTeamId?: number;
}) {
	return v.pipeAsync(
		registerTeamFormSchema,
		superRefineAsync(async (data, ctx) => {
			const linkedTeamId = data.teamId ? Number(data.teamId) : null;
			const name = linkedTeamId
				? (await TeamRepository.findById(linkedTeamId))?.name
				: data.pickUpName;
			if (!name) return;

			if (
				tournamentTeamNameTaken({
					tournament,
					name,
					exceptTournamentTeamId: ownTeamId,
				})
			) {
				ctx.addIssue({
					message: "forms:errors.regTeamNameTaken",
					path: [linkedTeamId ? "teamId" : "pickUpName"],
				});
			}
		}),
	);
}
