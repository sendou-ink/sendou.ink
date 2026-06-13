import { z } from "zod";
import {
	image,
	stringConstant,
	textAreaOptional,
	textFieldOptional,
	textFieldRequired,
} from "~/form/fields";
import { mySlugify } from "~/utils/urls";
import { TEAM } from "./team-constants";

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
