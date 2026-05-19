import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";

export const loader = async (_args: LoaderFunctionArgs) => {
	const user = getUser();

	if (!user) {
		return { qSettings: null };
	}

	const qSettings = await QSettingsRepository.settingsByUserId(user.id);

	return { qSettings };
};
