import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';

export const upsertTeamSchema = z.object({
	tournamentId: Fields.idConstant(),
	teamId: Fields.idConstantOptional(),
	pickupName: Fields.textFieldOptional({
		label: m.common_forms_name(),
		maxLength: 32
	}),
	avatar: Fields.imageOptional({
		label: m.tidy_real_elk_attend(),
		dimensions: 'logo'
	})
}); // xxx: validate did set at least one pickupName or teamId

export type UpsertTeamData = z.infer<typeof upsertTeamSchema>;
