import { z } from "zod";
import { mySlugify } from "~/utils/urls";
import * as TeamRepository from "./TeamRepository.server";
import {
	createTeamSchema,
	resetInviteLinkSchema,
	updateRosterSchema,
} from "./team-schemas";

export const createTeamSchemaServer = z.object({
	...createTeamSchema.shape,
	name: createTeamSchema.shape.name.refine(
		async (name) => {
			const teams = await TeamRepository.findAllUndisbanded();
			const customUrl = mySlugify(name);

			return !teams.some((team) => team.customUrl === customUrl);
		},
		{ message: "forms:errors.duplicateName" },
	),
});

export const teamParamsSchema = z.object({ customUrl: z.string() });

export const manageRosterSchema = z.union([
	updateRosterSchema,
	resetInviteLinkSchema,
]);
