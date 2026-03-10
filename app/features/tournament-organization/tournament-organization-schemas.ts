import { z } from "zod";
import { TOURNAMENT_ORGANIZATION_ROLES } from "~/db/tables";
import { TOURNAMENT_ORGANIZATION } from "~/features/tournament-organization/tournament-organization-constants";
import {
	array,
	badges,
	datetimeOptional,
	fieldset,
	select,
	stringConstant,
	textAreaOptional,
	textFieldOptional,
	textFieldRequired,
	toggle,
	userSearch,
} from "~/form/fields";
import { mySlugify } from "~/utils/urls";
import { _action, id } from "~/utils/zod";

const orgNameField = textFieldRequired({
	label: "labels.name",
	minLength: 2,
	maxLength: 64,
	validate: {
		func: (val) => mySlugify(val).length > 0,
		message: "forms:errors.noOnlySpecialCharacters",
	},
});

export const newOrganizationSchema = z.object({
	name: orgNameField,
});

export const organizationEditFormSchema = z.object({
	name: orgNameField,
	description: textAreaOptional({
		label: "labels.description",
		maxLength: TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH,
	}),
	members: array({
		label: "labels.members",
		bottomText: "bottomTexts.orgMembersInfo",
		max: 32,
		field: fieldset({
			fields: z.object({
				userId: userSearch({ label: "labels.user" }),
				role: select({
					label: "labels.orgMemberRole",
					items: TOURNAMENT_ORGANIZATION_ROLES.map((role) => ({
						value: role,
						label: `options.orgRole.${role}` as const,
					})),
				}),
				roleDisplayName: textFieldOptional({
					label: "labels.orgMemberRoleDisplayName",
					maxLength: 32,
				}),
			}),
		}),
	}),
	socials: array({
		label: "labels.orgSocialLinks",
		max: 10,
		field: textFieldRequired({ validate: "url", maxLength: 100 }),
	}),
	series: array({
		label: "labels.orgSeries",
		max: 10,
		field: fieldset({
			fields: z.object({
				name: textFieldRequired({
					label: "labels.orgSeriesName",
					minLength: 1,
					maxLength: 32,
				}),
				description: textAreaOptional({
					label: "labels.description",
					maxLength: TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH,
				}),
				showLeaderboard: toggle({ label: "labels.orgSeriesShowLeaderboard" }),
			}),
		}),
	}),
	badges: badges({ label: "labels.orgBadges", maxCount: 50 }),
});

export const banUserActionSchema = z.object({
	_action: stringConstant("BAN_USER"),
	userId: userSearch({ label: "labels.banUserPlayer" }),
	privateNote: textAreaOptional({
		label: "labels.banUserNote",
		bottomText: "bottomTexts.banUserNoteHelp",
		maxLength: TOURNAMENT_ORGANIZATION.BAN_REASON_MAX_LENGTH,
	}),
	expiresAt: datetimeOptional({
		label: "labels.banUserExpiresAt",
		bottomText: "bottomTexts.banUserExpiresAtHelp",
		min: () => new Date(),
		minMessage: "errors.dateInPast",
	}),
});

const unbanUserActionSchema = z.object({
	_action: _action("UNBAN_USER"),
	userId: id,
});

export const updateIsEstablishedSchema = z.object({
	_action: stringConstant("UPDATE_IS_ESTABLISHED"),
	isEstablished: toggle({
		label: "labels.isEstablished",
	}),
});

const deleteOrganizationActionSchema = z.object({
	_action: _action("DELETE_ORGANIZATION"),
});

const leaveOrganizationActionSchema = z.object({
	_action: _action("LEAVE_ORGANIZATION"),
});

export const orgPageActionSchema = z.union([
	banUserActionSchema,
	unbanUserActionSchema,
	updateIsEstablishedSchema,
	deleteOrganizationActionSchema,
	leaveOrganizationActionSchema,
]);
