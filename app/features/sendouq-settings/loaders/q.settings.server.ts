import { requireUser } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";

export const loader = async () => {
	const user = await requireUser();

	return {
		settings: await QSettingsRepository.settingsByUserId(user.id),
		trusted: await QSettingsRepository.findTrustedUsersByGiverId(user.id),
		team: await QSettingsRepository.currentTeamByUserId(user.id),
	};
};
