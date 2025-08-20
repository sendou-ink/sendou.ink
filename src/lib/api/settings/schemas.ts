import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';
import { languagesUnified, modesLongTranslations } from '$lib/utils/i18n';
import { modesShort } from '$lib/constants/in-game/modes';
import { asset } from '$app/paths';

export const updatePreferencesSchema = z.object({
	disableBuildAbilitySorting: z.boolean().optional(),
	disallowScrimPickupsFromUntrusted: z.boolean().optional()
});

export const updateAccessibilitySettingsSchema = z.object({
	noScreen: Fields.toggle({
		label: m.less_quick_ox_dash(),
		bottomText: m.heavy_weary_mink_twist()
	})
});

export type UpdateAccessibilitySettingsData = z.infer<typeof updateAccessibilitySettingsSchema>;

export const updateMatchProfileSchema = z.object({
	qWeaponPool: Fields.weaponPool({
		label: m.user_weaponPool(),
		bottomText: m.early_weird_nils_splash(),
		maxCount: 4
	}),
	vc: Fields.radioGroup({
		label: m.q_settings_voiceChat_canVC_header(),
		items: (['YES', 'NO', 'LISTEN_ONLY'] as const).map((value) => ({
			label:
				value === 'YES'
					? m.q_settings_voiceChat_canVC_yes()
					: value === 'NO'
						? m.q_settings_voiceChat_canVC_no()
						: m.q_settings_voiceChat_canVC_listenOnly(),
			value
		}))
	}),
	languages: Fields.checkboxGroup({
		label: m.q_settings_voiceChat_languages_header(),
		items: languagesUnified.map((lang) => ({
			label: lang.name,
			value: lang.code
		}))
	}),
	modes: Fields.checkboxGroup({
		label: m.dirty_heroic_jackdaw_radiate(),
		bottomText: m.male_merry_weasel_sprout(),
		items: modesShort.map((mode) => ({
			value: mode,
			label: modesLongTranslations[mode](),
			imgSrc: asset(`/img/modes/${mode}.avif`)
		}))
	}),
	maps: Fields.mapPool({
		label: m.just_steep_ocelot_tend(),
		maxCount: 7,
		disabledBannedMaps: true
	})
});

export type UpdateMatchProfileData = z.infer<typeof updateMatchProfileSchema>;
