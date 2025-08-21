import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { mySlugify } from '$lib/utils/urls';

const TEAM_NAME_MIN_LENGTH = 2;
const TEAM_NAME_MAX_LENGTH = 64;

export const createTeamSchema = z.object({
	name: Fields.textFieldRequired({
		label: m.common_forms_name(),
		minLength: TEAM_NAME_MIN_LENGTH,
		maxLength: TEAM_NAME_MAX_LENGTH,
		validate: {
			func: (teamName) => mySlugify(teamName).length > 0 && mySlugify(teamName) !== 'new',
			message: m.team_forms_errors_noOnlySpecialCharacters()
		}
	})
});

export const teamSlug = z
	.string()
	.min(TEAM_NAME_MIN_LENGTH)
	.max(TEAM_NAME_MAX_LENGTH)
	.toLowerCase();
