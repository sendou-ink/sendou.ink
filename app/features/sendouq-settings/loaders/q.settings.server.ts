import { requireUser } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";

export const loader = async () => {
	const user = requireUser();

	const allTeams = await TeamRepository.findAllMemberOfByUserId(user.id);
	const manageableTeams = allTeams.filter((t) => t.isOwner || t.isManager);

	return {
		settings: await QSettingsRepository.settingsByUserId(user.id),
		manageableTeams,
	};
};
