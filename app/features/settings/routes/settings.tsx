import type { MetaFunction } from "@remix-run/node";
import { useFetcher, useNavigate, useSearchParams } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { SendouSwitch } from "~/components/elements/Switch";
import { useUser } from "~/features/auth/core/user";
import { Theme, useTheme } from "~/features/theme/core/provider";
import { languages } from "~/modules/i18n/config";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { SETTINGS_PAGE, navIconUrl } from "~/utils/urls";
import { action } from "../actions/settings.server";
export { action };

export const handle: SendouRouteHandle = {
	breadcrumb: () => ({
		imgPath: navIconUrl("settings"),
		href: SETTINGS_PAGE,
		type: "IMAGE",
	}),
};

export default function SettingsPage() {
	const user = useUser();
	const { t } = useTranslation(["common"]);

	return (
		<Main halfWidth>
			<div className="stack md">
				<h2 className="text-lg">{t("common:pages.settings")}</h2>
				<LanguageSelector />
				<ThemeSelector />
				<div className="mt-6 stack md">
					<PreferenceSelectorSwitch
						_action="UPDATE_DISABLE_BUILD_ABILITY_SORTING"
						defaultSelected={
							user?.preferences.disableBuildAbilitySorting ?? false
						}
						label={t(
							"common:settings.UPDATE_DISABLE_BUILD_ABILITY_SORTING.label",
						)}
						bottomText={t(
							"common:settings.UPDATE_DISABLE_BUILD_ABILITY_SORTING.bottomText",
						)}
					/>
				</div>
			</div>
		</Main>
	);
}

export const meta: MetaFunction = (args) => {
	return metaTags({
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

function PreferenceSelectorSwitch({
	_action,
	label,
	bottomText,
	defaultSelected,
}: {
	_action: string;
	label: string;
	bottomText: string;
	defaultSelected: boolean;
}) {
	const fetcher = useFetcher();

	const onChange = (isSelected: boolean) => {
		fetcher.submit(
			{ _action, newValue: isSelected },
			{ method: "post", encType: "application/json" },
		);
	};

	return (
		<div>
			<SendouSwitch
				defaultSelected={defaultSelected}
				onChange={onChange}
				isDisabled={fetcher.state !== "idle"}
				data-testid={`${_action}-switch`}
			>
				{label}
			</SendouSwitch>
			<FormMessage type="info">{bottomText}</FormMessage>
		</div>
	);
}
