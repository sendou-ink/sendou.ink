import * as v from "valibot";
import { mySlugify } from "~/utils/urls";
import * as TeamRepository from "./TeamRepository.server";
import {
	createTeamSchema,
	resetInviteLinkSchema,
	updateRosterSchema,
} from "./team-schemas";

export const createTeamSchemaServer = v.objectAsync({
	...createTeamSchema.entries,
	name: v.pipeAsync(
		createTeamSchema.entries.name,
		v.checkAsync(async (name) => {
			const existingTeam = await TeamRepository.findByCustomUrl(
				mySlugify(name),
			);

			return !existingTeam;
		}, "forms:errors.duplicateName"),
	),
});

export const teamParamsSchema = v.object({ customUrl: v.string() });

export const manageRosterSchema = v.union([
	updateRosterSchema,
	resetInviteLinkSchema,
]);
