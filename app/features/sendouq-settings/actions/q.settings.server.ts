import { requireUser } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { settingsActionSchema } from "../q-settings-schemas.server";

export const action = async ({ request }: { request: Request }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: settingsActionSchema,
	});

	switch (data._action) {
		case "UPDATE_MAP_MODE_PREFERENCES": {
			if (typeof data.teamId === "number") {
				const allTeams = await TeamRepository.findAllMemberOfByUserId(user.id);
				const canManage = allTeams.some(
					(t) => t.id === data.teamId && (t.isOwner || t.isManager),
				);
				if (!canManage) {
					throw new Response(null, { status: 403 });
				}

				await QSettingsRepository.updateTeamMapModePreferences({
					mapModePreferences: data.mapModePreferences,
					teamId: data.teamId,
				});
			} else {
				await QSettingsRepository.updateUserMapModePreferences({
					mapModePreferences: data.mapModePreferences,
					userId: user.id,
				});
			}
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
		default: {
			assertUnreachable(data);
		}
	}

	return { ok: true };
};
