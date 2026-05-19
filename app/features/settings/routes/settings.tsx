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
import { useSearchParams } from "react-router";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import { metaTags } from "~/utils/remix";
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
import {
	defaultTab,
	resolveActiveTab,
	type SettingsTabSlug,
} from "../settings-tabs";
import "./settings.global.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["settings"],
	breadcrumb: () => ({
		imgPath: navIconUrl("settings"),
		href: SETTINGS_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Settings",
		location: args.location,
	});
};

// xxx: not working well for mobile
// xxx: inconsistent widths, SendouForm width for some and for others 100%

export default function SettingsPage() {
	const user = useUser();
	const { t } = useTranslation(["common", "settings"]);
	const [searchParams, setSearchParams] = useSearchParams();

	const isLoggedIn = Boolean(user);
	const activeTab = resolveActiveTab(searchParams.get("tab"), isLoggedIn);

	const handleSelectionChange = (key: React.Key) => {
		const slug = key as SettingsTabSlug;
		const next = new URLSearchParams(searchParams);
		if (slug === defaultTab(isLoggedIn)) {
			next.delete("tab");
		} else {
			next.set("tab", slug);
		}
		// xxx: the scrollTo(0, 0) in Tabs is not needed?
		setSearchParams(next, { preventScrollReset: true });
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
					selectedKey={activeTab}
					onSelectionChange={handleSelectionChange}
				>
					<SendouTabList aria-label={t("common:pages.settings")}>
						{user ? (
							<SendouTab id="preferences" icon={<SlidersHorizontal />}>
								{t("settings:tabs.preferences")}
							</SendouTab>
						) : null}
						{user ? (
							<SendouTab id="match-profile" icon={<MapIcon />}>
								{t("settings:tabs.matchProfile")}
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
