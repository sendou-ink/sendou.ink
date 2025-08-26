import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { mySlugify } from '$lib/utils/urls';

const TEAM_NAME_MIN_LENGTH = 2;
const TEAM_NAME_MAX_LENGTH = 64;

function teamNameField(bottomText?: string) {
	return Fields.textFieldRequired({
		label: m.common_forms_name(),
		minLength: TEAM_NAME_MIN_LENGTH,
		maxLength: TEAM_NAME_MAX_LENGTH,
		bottomText,
		validate: {
			func: (teamName) => mySlugify(teamName).length > 0 && mySlugify(teamName) !== 'new',
			message: m.team_forms_errors_noOnlySpecialCharacters()
		}
	});
}

export const createTeamSchema = z.object({
	name: teamNameField()
});

export const teamSlug = z
	.string()
	.min(TEAM_NAME_MIN_LENGTH)
	.max(TEAM_NAME_MAX_LENGTH)
	.toLowerCase();

export const editTeamSchema = z.object({
	slug: Fields.stringConstant(),
	theme: Fields.themeOptional({
		// xxx: custom colors
		label: m.common_custom_colors_title()
	}),
	name: teamNameField(m.team_forms_info_name()),
	bsky: Fields.textFieldOptional({
		label: m.team_forms_fields_teamBsky(),
		maxLength: 50,
		leftAddon: 'bsky.app/profile/'
	}),
	bio: Fields.textAreaOptional({
		maxLength: 2000,
		label: m.team_forms_fields_bio()
	}),
	logo: Fields.imageOptional({
		dimensions: 'logo',
		label: m.tame_knotty_trout_clasp()
	}),
	banner: Fields.imageOptional({
		dimensions: 'thick-banner',
		label: m.aqua_royal_macaw_aspire()
	})
});

export type EditTeamData = z.infer<typeof editTeamSchema>;
