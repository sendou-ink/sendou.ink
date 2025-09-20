import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { rankedModesShort } from '$lib/constants/in-game/modes';
import { TOURNAMENT } from '$lib/constants/tournament';

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

export const upsertTeamMapPool = z.object({
	tournamentId: Fields.idConstant(),
	AUTO_ALL: Fields.mapPool({
		modes: rankedModesShort,
		maxCount: TOURNAMENT.COUNTERPICK_MAPS_PER_MODE
	}),
	AUTO_SZ: Fields.mapPool({
		modes: ['SZ'],
		maxCount: TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
	}),
	AUTO_TC: Fields.mapPool({
		modes: ['TC'],
		maxCount: TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
	}),
	AUTO_RM: Fields.mapPool({
		modes: ['RM'],
		maxCount: TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
	}),
	AUTO_CB: Fields.mapPool({
		modes: ['CB'],
		maxCount: TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
	})
});
export type UpsertTeamMapPoolData = z.infer<typeof upsertTeamMapPool>;
