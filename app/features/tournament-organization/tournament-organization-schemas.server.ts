import * as v from "valibot";
import { mySlugify } from "~/utils/urls";
import { newOrganizationSchema } from "./tournament-organization-schemas";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";

export const newOrganizationSchemaServer = v.objectAsync({
	...newOrganizationSchema.entries,
	name: v.pipeAsync(
		newOrganizationSchema.entries.name,
		v.checkAsync(async (name) => {
			const existing = await TournamentOrganizationRepository.findBySlug(
				mySlugify(name),
			);

			return !existing;
		}, "forms:errors.duplicateOrgName"),
	),
});
