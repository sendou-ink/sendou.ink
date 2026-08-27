import {
	Globe,
	LogOut,
	Map as MapIcon,
	Palette,
	SlidersHorizontal,
	Volume2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import { useSearchParam } from "~/modules/search-params/hooks";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { LOG_OUT_URL, navIconUrl, SETTINGS_PAGE } from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "../../../components/elements/Tabs";
import { action } from "../actions/settings.server";
import { LocaleTab } from "../components/LocaleTab";
import { MatchProfileTab } from "../components/MatchProfileTab";
import { PreferencesTab } from "../components/PreferencesTab";
import { SoundsTab } from "../components/SoundsTab";
import { ThemeTab } from "../components/ThemeTab";
import { loader } from "../loaders/settings.server";
import type { SettingsTabSlug } from "../settings-constants";
import { settingsSearchParams } from "../settings-search-params";
import { defaultTab, resolveActiveTab } from "../settings-utils";
import "./settings.global.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["settings", "user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("settings"),
		href: SETTINGS_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Settings",
		image: ogPageImage("settings"),
		location: args.location,
	});
};

export default function SettingsPage() {
	const user = useUser();
	const { t } = useTranslation(["common", "settings"]);
	const [tab, setTab] = useSearchParam(settingsSearchParams, "tab");

	const isLoggedIn = Boolean(user);
	const activeTab = resolveActiveTab(tab, isLoggedIn);

	const handleSelectionChange = (key: React.Key) => {
		const slug = key as SettingsTabSlug;
		setTab(slug === defaultTab(isLoggedIn) ? null : slug);
	};

	return (
		<Main>
			<div className="stack md">
				<div className="stack horizontal justify-between items-center">
					<h2 className="text-lg">{t("common:pages.settings")}</h2>
					{user ? (
						<form method="post" action={LOG_OUT_URL}>
							<SendouButton
								size="small"
								variant="outlined"
								icon={<LogOut />}
								type="submit"
							>
								{t("common:header.logout")}
							</SendouButton>
						</form>
					) : null}
				</div>
				<SendouTabs
					orientation="vertical"
					horizontalBelow={720}
					selectedKey={activeTab}
					onSelectionChange={handleSelectionChange}
				>
					<SendouTabList aria-label={t("common:pages.settings")}>
						{user ? (
							<SendouTab id="match-profile" icon={<MapIcon />}>
								{t("settings:tabs.matchProfile")}
							</SendouTab>
						) : null}
						{user ? (
							<SendouTab id="preferences" icon={<SlidersHorizontal />}>
								{t("settings:tabs.preferences")}
							</SendouTab>
						) : null}
						<SendouTab id="locale" icon={<Globe />}>
							{t("settings:tabs.locale")}
						</SendouTab>
						<SendouTab id="theme" icon={<Palette />}>
							{t("settings:tabs.theme")}
						</SendouTab>
						{user ? (
							<SendouTab id="sounds" icon={<Volume2 />}>
								{t("settings:tabs.sounds")}
							</SendouTab>
						) : null}
					</SendouTabList>
					{user ? (
						<SendouTabPanel id="preferences">
							<PreferencesTab />
						</SendouTabPanel>
					) : null}
					{user ? (
						<SendouTabPanel id="match-profile">
							<MatchProfileTab />
						</SendouTabPanel>
					) : null}
					<SendouTabPanel id="locale">
						<LocaleTab />
					</SendouTabPanel>
					<SendouTabPanel id="theme">
						<ThemeTab />
					</SendouTabPanel>
					{user ? (
						<SendouTabPanel id="sounds">
							<SoundsTab />
						</SendouTabPanel>
					) : null}
				</SendouTabs>
			</div>
		</Main>
	);
}
