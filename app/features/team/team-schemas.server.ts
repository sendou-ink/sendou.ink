import { z } from "zod";
import { mySlugify } from "~/utils/urls";
import { _action, themeInputSchema } from "~/utils/zod";
import * as TeamRepository from "./TeamRepository.server";
import {
	createTeamSchema,
	editTeamFormSchema,
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

export const teamProfilePageActionSchema = z.union([
	z.object({
		_action: _action("LEAVE_TEAM"),
	}),
	z.object({
		_action: _action("MAKE_MAIN_TEAM"),
	}),
	z.object({
		_action: _action("DELETE_TEAM"),
	}),
]);

const updateTeamCustomThemeSchema = z.object({
	_action: _action("UPDATE_CUSTOM_THEME"),
	newValue: z.preprocess(
		(val) => (!val || val === "null" ? null : val),
		themeInputSchema.nullable(),
	),
});

/** Every payload the team edit route action accepts, discriminated by `_action`. */
export const editTeamActionSchema = z.union([
	editTeamFormSchema,
	updateTeamCustomThemeSchema,
]);

export const manageRosterSchema = z.union([
	updateRosterSchema,
	z.object({
		_action: _action("RESET_INVITE_LINK"),
	}),
]);
