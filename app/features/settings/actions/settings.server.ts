import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseRequestPayload, successToast } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { settingsEditSchema } from "../settings-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: settingsEditSchema,
	});

	switch (data._action) {
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
		case "UPDATE_NO_SCREEN": {
			await QSettingsRepository.updateNoScreen({
				userId: user.id,
				noScreen: Number(data.newValue),
			});
			break;
		}
		case "UPDATE_CLOCK_FORMAT": {
			await UserRepository.updatePreferences(user.id, {
				clockFormat: data.newValue,
			});
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return successToast("Settings updated");
};
