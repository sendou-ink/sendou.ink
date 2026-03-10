import { z } from "zod";
import { mySlugify } from "~/utils/urls";
import { _action, customCssVarObject, falsyToNull, id } from "~/utils/zod";
import * as TeamRepository from "./TeamRepository.server";
import { TEAM, TEAM_MEMBER_ROLES } from "./team-constants";
import { createTeamSchema } from "./team-schemas";

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
]);

const deleteActionsSchema = z.object({
	_action: z.union([
		_action("DELETE_TEAM"),
		_action("DELETE_AVATAR"),
		_action("DELETE_BANNER"),
	]),
});

export const editTeamSchema = z.union([
	deleteActionsSchema,
	z.object({
		_action: _action("EDIT"),
		name: z.string().min(TEAM.NAME_MIN_LENGTH).max(TEAM.NAME_MAX_LENGTH),
		bio: z.preprocess(
			falsyToNull,
			z.string().max(TEAM.BIO_MAX_LENGTH).nullable(),
		),
		bsky: z.preprocess(
			falsyToNull,
			z.string().max(TEAM.BSKY_MAX_LENGTH).nullable(),
		),
		tag: z.preprocess(
			falsyToNull,
			z.string().max(TEAM.TAG_MAX_LENGTH).nullable(),
		),
		css: customCssVarObject,
	}),
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
