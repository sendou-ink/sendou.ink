import * as v from "valibot";
import {
	TOURNAMENT_ORGANIZATION,
	TOURNAMENT_ORGANIZATION_ROLES,
} from "~/features/tournament-organization/tournament-organization-constants";
import {
	array,
	badges,
	datetimeOptional,
	fieldset,
	image,
	select,
	stringConstant,
	textAreaOptional,
	textField,
	textFieldOptional,
	toggle,
	userSearch,
} from "~/form/fields";
import { _action, id, superRefine } from "~/utils/schema";
import { mySlugify } from "~/utils/urls";

const orgNameField = textField({
	label: "labels.name",
	minLength: 2,
	maxLength: 64,
	validate: {
		func: (val) => mySlugify(val).length > 0,
		message: "forms:errors.noOnlySpecialCharacters",
	},
});

export const newOrganizationSchema = v.object({
	name: orgNameField,
});

export const organizationEditFormSchema = v.pipe(
	v.object({
		name: orgNameField,
		logo: image({ label: "labels.logo", autoValidate: true }),
		description: textAreaOptional({
			label: "labels.description",
			maxLength: TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH,
		}),
		members: array({
			label: "labels.members",
			bottomText: "bottomTexts.orgMembersInfo",
			max: 32,
			field: fieldset({
				fields: v.object({
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
			field: textField({ validate: "url", maxLength: 100 }),
		}),
		series: array({
			label: "labels.orgSeries",
			max: 10,
			field: fieldset({
				fields: v.object({
					name: textField({
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
	}),
	superRefine((data, ctx) => {
		const seenUserIds = new Set<number>();

		for (const [index, member] of data.members.entries()) {
			if (seenUserIds.has(member.userId)) {
				ctx.addIssue({
					message: "forms:errors.duplicateOrgMember",
					path: ["members", index, "userId"],
				});
				continue;
			}

			seenUserIds.add(member.userId);
		}
	}),
);

export const banUserActionSchema = v.object({
	_action: stringConstant("BAN_USER"),
	userId: userSearch({ label: "labels.player" }),
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

const unbanUserActionSchema = v.object({
	_action: _action("UNBAN_USER"),
	userId: id,
});

export const updateIsEstablishedSchema = v.object({
	_action: stringConstant("UPDATE_IS_ESTABLISHED"),
	isEstablished: toggle({
		label: "labels.isEstablished",
	}),
});

const deleteOrganizationActionSchema = v.object({
	_action: _action("DELETE_ORGANIZATION"),
});

const leaveOrganizationActionSchema = v.object({
	_action: _action("LEAVE_ORGANIZATION"),
});

export const orgPageActionSchema = v.union([
	banUserActionSchema,
	unbanUserActionSchema,
	updateIsEstablishedSchema,
	deleteOrganizationActionSchema,
	leaveOrganizationActionSchema,
]);
