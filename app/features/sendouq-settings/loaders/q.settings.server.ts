import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

	return {
		settings: await QSettingsRepository.settingsByUserId(user.id),
		trusted: await QSettingsRepository.findTrustedUsersByGiverId(user.id),
		team: await QSettingsRepository.currentTeamByUserId(user.id),
	};
};
