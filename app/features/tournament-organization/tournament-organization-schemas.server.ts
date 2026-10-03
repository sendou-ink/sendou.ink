import * as v from "valibot";
import { mySlugify } from "~/utils/urls";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";
import { newOrganizationSchema } from "./tournament-organization-schemas";

export const newOrganizationSchemaServer = v.objectAsync({
	...newOrganizationSchema.entries,
	name: v.pipeAsync(
		newOrganizationSchema.entries.name,
		v.checkAsync(async (name) => {
			return !(await TournamentOrganizationRepository.existsBySlug(
				mySlugify(name),
			));
		}, "forms:errors.duplicateOrgName"),
	),
});
