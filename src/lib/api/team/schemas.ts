import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { mySlugify } from '$lib/utils/urls';

export const createTeamSchema = z.object({
	name: Fields.textFieldRequired({
		label: m.common_forms_name(),
		minLength: 2,
		maxLength: 64,
		validate: {
			func: (teamName) => mySlugify(teamName).length > 0 && mySlugify(teamName) !== 'new',
			message: m.team_forms_errors_noOnlySpecialCharacters()
		}
	})
});
