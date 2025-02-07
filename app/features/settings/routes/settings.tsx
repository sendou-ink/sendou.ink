import type { MetaFunction } from "@remix-run/node";
import { useNavigate, useSearchParams } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { Theme, useTheme } from "~/features/theme/core/provider";
import { languages } from "~/modules/i18n/config";
import { openGraph } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { SETTINGS_PAGE, navIconUrl } from "~/utils/urls";

export const handle: SendouRouteHandle = {
	breadcrumb: () => ({
		imgPath: navIconUrl("settings"),
		href: SETTINGS_PAGE,
		type: "IMAGE",
	}),
};

export default function SettingsPage() {
	const { t } = useTranslation(["common"]);

	return (
		<Main halfWidth>
			<div className="stack md">
				<h2 className="text-lg">{t("common:pages.settings")}</h2>
				<LanguageSelector />
				<ThemeSelector />
			</div>
		</Main>
	);
}

export const meta: MetaFunction = (args) => {
	return openGraph({
		title: "Settings",
		location: args.location,
	});
};

function LanguageSelector() {
	const { t } = useTranslation(["common"]);
	const { i18n } = useTranslation();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	const handleLanguageChange = (
		event: React.ChangeEvent<HTMLSelectElement>,
	) => {
		const newLang = event.target.value;
		navigate(`?${addUniqueParam(searchParams, "lng", newLang).toString()}`);
	};

	return (
		<div>
			<Label htmlFor="lang">{t("common:header.language")}</Label>
			<select
				id="lang"
				defaultValue={i18n.language}
				onChange={handleLanguageChange}
			>
				{languages.map((lang) => (
					<option key={lang.code} value={lang.code}>
						{lang.name}
					</option>
				))}
			</select>
		</div>
	);
}

function addUniqueParam(
	oldParams: URLSearchParams,
	name: string,
	value: string,
): URLSearchParams {
	const paramsCopy = new URLSearchParams(oldParams);
	paramsCopy.delete(name);
	paramsCopy.append(name, value);
	return paramsCopy;
}

function ThemeSelector() {
	const { t } = useTranslation(["common"]);
	const { userTheme, setUserTheme } = useTheme();

	return (
		<div>
			<Label htmlFor="theme">{t("common:header.theme")}</Label>
			<select
				id="theme"
				defaultValue={userTheme ?? "auto"}
				onChange={(e) => setUserTheme(e.target.value as Theme)}
			>
				{(["auto", Theme.DARK, Theme.LIGHT] as const).map((theme) => {
					return (
						<option key={theme} value={theme}>
							{t(`common:theme.${theme}`)}
						</option>
					);
				})}
			</select>
		</div>
	);
}
