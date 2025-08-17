import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';

export const createTeamSchema = z.object({
	name: Fields.textFieldRequired({
		label: m.common_forms_name(),
		minLength: 2,
		maxLength: 64
	})
});
