import { z } from "zod";
import { mySlugify } from "~/utils/urls";
import { _action, id, themeInputSchema } from "~/utils/zod";
import * as TeamRepository from "./TeamRepository.server";
import { TEAM_MEMBER_ROLES } from "./team-constants";
import { createTeamSchema, editTeamFormSchema } from "./team-schemas";

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
	z.object({
		_action: _action("RESET_INVITE_LINK"),
	}),
	z.object({
		_action: _action("DELETE_MEMBER"),
		userId: id,
	}),
	z.object({
		_action: _action("ADD_MANAGER"),
		userId: id,
	}),
	z.object({
		_action: _action("REMOVE_MANAGER"),
		userId: id,
	}),
	z.object({
		_action: _action("UPDATE_MEMBER_ROLE"),
		userId: id,
		role: z.union([z.enum(TEAM_MEMBER_ROLES), z.literal("")]),
	}),
]);
