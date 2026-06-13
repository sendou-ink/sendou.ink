import { z } from "zod";
import {
	array,
	fieldset,
	idConstant,
	image,
	selectOptional,
	stringConstant,
	textAreaOptional,
	textFieldOptional,
	textFieldRequired,
	toggle,
} from "~/form/fields";
import { mySlugify } from "~/utils/urls";
import { TEAM, TEAM_MEMBER_ROLES } from "./team-constants";

const teamNameValidate = {
	func: (teamName: string) =>
		mySlugify(teamName).length > 0 && mySlugify(teamName) !== "new",
	message: "forms:errors.noOnlySpecialCharacters",
} as const;

export const createTeamSchema = z.object({
	name: textFieldRequired({
		label: "labels.name",
		minLength: TEAM.NAME_MIN_LENGTH,
		maxLength: TEAM.NAME_MAX_LENGTH,
		validate: teamNameValidate,
	}),
});

export const editTeamFormSchema = z.object({
	_action: stringConstant("EDIT"),
	name: textFieldRequired({
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

export const updateRosterSchema = z.object({
	_action: stringConstant("UPDATE_ROSTER"),
	members: array({
		max: TEAM.MAX_MEMBER_COUNT,
		addable: false,
		field: fieldset({
			fields: z.object({
				userId: idConstant(),
				role: selectOptional({
					label: "labels.teamMemberRole",
					items: TEAM_MEMBER_ROLES.map((role) => ({
						value: role,
						label: `options.teamMemberRole.${role}` as const,
					})),
				}),
				isManager: toggle({ label: "labels.teamEditor" }),
			}),
		}),
	}),
});
