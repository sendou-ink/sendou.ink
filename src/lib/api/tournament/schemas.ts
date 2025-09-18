import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';

export const upsertTeamSchema = z
	.object({
		tournamentId: Fields.idConstant(),
		teamId: Fields.customJsonField(
			{
				label: m.common_header_adder_team(),
				initialValue: 'pickup'
			},
			z
				.union([z.coerce.number<string>(), z.literal('pickup')])
				.transform((value) => (value === 'pickup' ? null : value))
		),
		pickupName: Fields.textFieldOptional({
			label: m.common_forms_name(),
			maxLength: 32
		}),
		avatar: Fields.imageOptional({
			label: m.tidy_real_elk_attend(),
			dimensions: 'logo'
		})
	})
	.refine(
		(data) => {
			if (data.teamId) return true;
			return Boolean(data.pickupName);
		},
		{
			error: m.common_forms_errors_required(),
			path: ['pickupName']
		}
	);
export type UpsertTeamData = z.infer<typeof upsertTeamSchema>;
