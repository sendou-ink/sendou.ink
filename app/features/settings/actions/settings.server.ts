import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
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

			await UserRepository.updateOwnCustomTheme(clampedTheme);
			break;
		}
		case "UPDATE_DISABLE_BUILD_ABILITY_SORTING": {
			await UserRepository.updateOwnPreferences({
				disableBuildAbilitySorting: data.newValue,
			});
			break;
		}
		case "DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED": {
			await UserRepository.updateOwnPreferences({
				disallowScrimPickupsFromUntrusted: data.newValue,
			});
			break;
		}
		case "UPDATE_SPOILER_FREE_MODE": {
			await UserRepository.updateOwnPreferences({
				spoilerFreeMode: data.newValue,
			});
			break;
		}
		case "UPDATE_CLOCK_FORMAT": {
			await UserRepository.updateOwnPreferences({
				clockFormat: data.newValue,
			});
			break;
		}
		case "UPDATE_WEAPON_REPORT_DEFAULT_OPEN": {
			await UserRepository.updateOwnPreferences({
				weaponReportDefaultOpen: data.newValue,
			});
			break;
		}
		case "UPDATE_MATCH_PROFILE": {
			await MatchProfileRepository.updateOwnMatchProfile({
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
