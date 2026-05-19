import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import { resolveActiveTab } from "../settings-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = getUser();
	const url = new URL(request.url);
	const activeTab = resolveActiveTab(
		url.searchParams.get("tab"),
		Boolean(user),
	);

	// xxx: I guess we need no tab specific logic here, just load everything up front
	if (!user || activeTab !== "match-profile") {
		return {
			activeTab,
			qSettings: null,
			noScreen: null,
			noSplatnet: null,
		};
	}

	const qSettings = await QSettingsRepository.settingsByUserId(user.id);

	return {
		activeTab,
		qSettings,
		noScreen: Boolean(qSettings.noScreen),
		noSplatnet: Boolean(qSettings.noSplatnet),
	};
};
