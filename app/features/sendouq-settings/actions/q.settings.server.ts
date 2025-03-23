import type { ActionFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import { parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { settingsActionSchema } from "../q-settings-schemas.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		request,
		schema: settingsActionSchema,
	});

	switch (data._action) {
		case "UPDATE_MAP_MODE_PREFERENCES": {
			await QSettingsRepository.updateUserMapModePreferences({
				mapModePreferences: data.mapModePreferences,
				userId: user.id,
			});
			break;
		}
		case "UPDATE_VC": {
			await QSettingsRepository.updateVoiceChat({
				userId: user.id,
				vc: data.vc,
				languages: data.languages,
			});
			break;
		}
		case "UPDATE_SENDOUQ_WEAPON_POOL": {
			await QSettingsRepository.updateSendouQWeaponPool({
				userId: user.id,
				weaponPool: data.weaponPool,
			});
			break;
		}
		case "UPDATE_NO_SCREEN": {
			await QSettingsRepository.updateNoScreen({
				userId: user.id,
				noScreen: Number(data.noScreen),
			});
			break;
		}
		case "REMOVE_TRUST": {
			await QSettingsRepository.deleteTrustedUser({
				trustGiverUserId: user.id,
				trustReceiverUserId: data.userToRemoveTrustFromId,
			});
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return { ok: true };
};
