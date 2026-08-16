import { z } from "zod";
import { mySlugify } from "~/utils/urls";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";
import { newOrganizationSchema } from "./tournament-organization-schemas";

export const newOrganizationSchemaServer = z.object({
	...newOrganizationSchema.shape,
	name: newOrganizationSchema.shape.name.refine(
		async (name) => {
			const existing = await TournamentOrganizationRepository.findBySlug(
				mySlugify(name),
			);

			return !existing;
		},
		{ message: "forms:errors.duplicateOrgName" },
	),
});
