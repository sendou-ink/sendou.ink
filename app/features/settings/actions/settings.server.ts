import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { isSupporter } from "~/modules/permissions/utils";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import { errorToast, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { settingsActionSchema } from "../settings-schemas.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: settingsActionSchema,
	});

	switch (data._action) {
		case "UPDATE_CUSTOM_THEME": {
			if (!isSupporter(user)) {
				throw errorToast("Custom themes are for supporters only");
			}

			const clampedTheme = data.newValue
				? clampThemeToGamut(data.newValue)
				: null;

			await UserRepository.updateCustomTheme(user.id, clampedTheme);
			break;
		}
		case "UPDATE_DISABLE_BUILD_ABILITY_SORTING": {
			await UserRepository.updatePreferences(user.id, {
				disableBuildAbilitySorting: data.newValue,
			});
			break;
		}
		case "DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED": {
			await UserRepository.updatePreferences(user.id, {
				disallowScrimPickupsFromUntrusted: data.newValue,
			});
			break;
		}
		case "UPDATE_SPOILER_FREE_MODE": {
			await UserRepository.updatePreferences(user.id, {
				spoilerFreeMode: data.newValue,
			});
			break;
		}
		case "UPDATE_CLOCK_FORMAT": {
			await UserRepository.updatePreferences(user.id, {
				clockFormat: data.newValue,
			});
			break;
		}
		case "UPDATE_WEAPON_REPORT_DEFAULT_OPEN": {
			await UserRepository.updatePreferences(user.id, {
				weaponReportDefaultOpen: data.newValue,
			});
			break;
		}
		case "UPDATE_DATE_FORMAT": {
			await UserRepository.updatePreferences(user.id, {
				dateFormat: data.newValue,
			});
			break;
		}
		case "UPDATE_MATCH_PROFILE": {
			await QSettingsRepository.updateMatchProfile({
				userId: user.id,
				mapModePreferences: data.mapModePreferences,
				vc: data.vc,
				languages: data.languages,
				weaponPool: data.weaponPool,
				noScreen: Number(data.noScreen),
				noSplatnet: Number(data.noSplatnet),
			});
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
