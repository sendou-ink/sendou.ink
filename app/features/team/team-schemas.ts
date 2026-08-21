import * as v from "valibot";
import type { UserMapModePreferences } from "~/db/tables-json";
import { mapModePreferencesValueSchema } from "~/features/settings/match-profile-schemas";
import {
	array,
	customField,
	fieldset,
	idConstant,
	image,
	select,
	selectOptional,
	stringConstant,
	textAreaOptional,
	textField,
	textFieldOptional,
	toggle,
} from "~/form/fields";
import {
	_action,
	preprocess,
	superRefine,
	themeInputSchema,
} from "~/utils/schema";
import { mySlugify } from "~/utils/urls";
import {
	CUSTOM_ROLE_MAX_LENGTH,
	TEAM,
	TEAM_MEMBER_ROLES,
} from "./team-constants";

export const resetInviteLinkSchema = v.object({
	_action: _action("RESET_INVITE_LINK"),
});

export const teamProfilePageActionSchema = v.union([
	v.object({
		_action: _action("LEAVE_TEAM"),
	}),
	v.object({
		_action: _action("MAKE_MAIN_TEAM"),
	}),
	v.object({
		_action: _action("DELETE_TEAM"),
	}),
]);

const teamNameValidate = {
	func: (teamName: string) =>
		mySlugify(teamName).length > 0 && mySlugify(teamName) !== "new",
	message: "forms:errors.noOnlySpecialCharacters",
} as const;

export const createTeamSchema = v.object({
	name: textField({
		label: "labels.name",
		minLength: TEAM.NAME_MIN_LENGTH,
		maxLength: TEAM.NAME_MAX_LENGTH,
		validate: teamNameValidate,
	}),
});

export const editTeamFormSchema = v.object({
	_action: stringConstant("EDIT"),
	name: textField({
		label: "labels.name",
		bottomText: "bottomTexts.name",
		minLength: TEAM.NAME_MIN_LENGTH,
		maxLength: TEAM.NAME_MAX_LENGTH,
		validate: teamNameValidate,
	}),
	tag: textFieldOptional({
		label: "labels.tag",
		bottomText: "bottomTexts.tag",
		maxLength: TEAM.TAG_MAX_LENGTH,
	}),
	bsky: textFieldOptional({
		label: "labels.teamBsky",
		leftAddon: "https://bsky.app/profile/",
		maxLength: TEAM.BSKY_MAX_LENGTH,
	}),
	bio: textAreaOptional({
		label: "labels.bio",
		maxLength: TEAM.BIO_MAX_LENGTH,
	}),
	logo: image({ label: "labels.logo" }),
	banner: image({ label: "labels.banner", dimensions: "thick-banner" }),
});

export const updateTeamCustomThemeSchema = v.object({
	_action: _action("UPDATE_CUSTOM_THEME"),
	newValue: preprocess(
		(val) => (!val || val === "null" ? null : val),
		v.nullable(themeInputSchema),
	),
});

export const updateTeamMapModePreferencesSchema = v.object({
	_action: stringConstant("UPDATE_MAP_MODE_PREFERENCES"),
	mapModePreferences: customField(
		{ initialValue: { modes: [], pool: [] } satisfies UserMapModePreferences },
		mapModePreferencesValueSchema,
	),
});

const removeTeamMapModePreferencesSchema = v.object({
	_action: _action("REMOVE_MAP_MODE_PREFERENCES"),
});

/** Every payload the team edit route action accepts, discriminated by `_action`. */
export const editTeamActionSchema = v.union([
	editTeamFormSchema,
	updateTeamCustomThemeSchema,
	updateTeamMapModePreferencesSchema,
	removeTeamMapModePreferencesSchema,
]);

/** Sentinel `role` value selected to switch a member to a free-text custom role. Never stored. */
export const CUSTOM_ROLE_VALUE = "CUSTOM" as const;

export const updateRosterSchema = v.pipe(
	v.object({
		_action: stringConstant("UPDATE_ROSTER"),
		members: array({
			max: TEAM.MAX_MEMBER_COUNT,
			addable: false,
			sortable: true,
			field: fieldset({
				fields: v.object({
					userId: idConstant(),
					role: selectOptional({
						label: "labels.teamMemberRole",
						items: [
							...TEAM_MEMBER_ROLES.map((role) => ({
								value: role,
								label: `options.teamMemberRole.${role}` as const,
							})),
							{
								value: CUSTOM_ROLE_VALUE,
								label: "options.teamMemberRole.CUSTOM" as const,
							},
						],
					}),
					customRole: textFieldOptional({
						label: "labels.teamMemberCustomRole",
						maxLength: CUSTOM_ROLE_MAX_LENGTH,
					}),
					roleType: select({
						label: "labels.teamMemberRoleType",
						items: [
							{ value: "PLAYER", label: "options.teamMemberRoleType.PLAYER" },
							{ value: "OTHER", label: "options.teamMemberRoleType.OTHER" },
						],
					}),
					isManager: toggle({ label: "labels.teamEditor" }),
				}),
			}),
		}),
	}),
	superRefine((data, ctx) => {
		for (const [index, member] of data.members.entries()) {
			const isCustom = member.role === CUSTOM_ROLE_VALUE;

			if (isCustom && !member.customRole) {
				ctx.addIssue({
					path: ["members", index, "customRole"],
					message: "forms:errors.customRoleRequired",
				});
			}
		}
	}),
);
