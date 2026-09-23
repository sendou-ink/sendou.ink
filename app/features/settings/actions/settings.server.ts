import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import { cancelActiveGroupLikes } from "~/features/sendouq/core/likes.server";
import {
	refreshSendouQInstance,
	SendouQ,
} from "~/features/sendouq/core/SendouQ.server";
import {
	SENDOUQ_LOOKING_CHANNEL,
	sqGroupChannel,
} from "~/features/sendouq/q-constants";
import * as ThemePalette from "~/features/theme/core/ThemePalette";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import { isSupporter } from "~/modules/permissions/utils";
import { errorToast } from "~/utils/remix.server";
import { toDBBoolean } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { settingsActionSchema } from "../settings-schemas.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: settingsActionSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	switch (data._action) {
		case "UPDATE_CUSTOM_THEME": {
			if (!isSupporter(user)) {
				throw errorToast("Custom themes are for supporters only");
			}

			const clampedTheme = data.newValue
				? ThemePalette.build(data.newValue)
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
			const { mapModePreferencesChanged, noScreenChanged } =
				await MatchProfileRepository.updateOwnMatchProfile({
					mapModePreferences: data.mapModePreferences,
					vc: data.vc,
					languages: data.languages,
					weaponPool: data.weaponPool,
					noScreen: toDBBoolean(data.noScreen),
				});

			// challenges are based on the preferences shown at the time, so changing them undoes pending ones
			const likesCancelled =
				mapModePreferencesChanged || noScreenChanged
					? await cancelActiveGroupLikes(user.id)
					: false;

			if (!likesCancelled) {
				await showMatchProfileToOthers(user.id);
			}
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

/** SendouQ pages serve group members from the in-memory instance, so a match profile change stays invisible to everyone else till it is rebuilt. */
async function showMatchProfileToOthers(userId: number) {
	const ownGroup = SendouQ.findOwnGroup(userId);
	if (!ownGroup) return;

	await refreshSendouQInstance();

	ChatSystemMessage.send([
		{ channel: sqGroupChannel(ownGroup.id) },
		{ channel: SENDOUQ_LOOKING_CHANNEL },
	]);
}
