import z from 'zod';
import * as Fields from '$lib/form/fields';
import { m } from '$lib/paraglide/messages';

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
	})
});

export type UpdateMatchProfileData = z.infer<typeof updateMatchProfileSchema>;
