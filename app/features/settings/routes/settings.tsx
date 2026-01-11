import { LogOut } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import {
	useFetcher,
	useLoaderData,
	useNavigate,
	useSearchParams,
} from "react-router";
import { Divider } from "~/components/Divider";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import {
	CUSTOM_THEME_VARS,
	type CustomTheme,
	type CustomThemeVar,
} from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { Theme, useTheme } from "~/features/theme/core/provider";
import { languages } from "~/modules/i18n/config";
import { useHasRole } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { LOG_OUT_URL, navIconUrl, SETTINGS_PAGE } from "~/utils/urls";
import { LinkButton, SendouButton } from "../../../components/elements/Button";
import { SendouPopover } from "../../../components/elements/Popover";
import { action } from "../actions/settings.server";
import { loader } from "../loaders/settings.server";
import styles from "./settings.module.css";
export { loader, action };

export const handle: SendouRouteHandle = {
	breadcrumb: () => ({
		imgPath: navIconUrl("settings"),
		href: SETTINGS_PAGE,
		type: "IMAGE",
	}),
};

export default function SettingsPage() {
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const { t } = useTranslation(["common"]);

	return (
		<Main halfWidth>
			<div className="stack md">
				<h2 className="text-lg">{t("common:pages.settings")}</h2>
				<Divider className={styles.divider} smallText>
					{t("common:settings.locales")}
				</Divider>
				<LanguageSelector />
				{user ? <ClockFormatSelector /> : null}
				<Divider className={styles.divider} smallText>
					{t("common:settings.theme")}
				</Divider>
				<ThemeSelector />
				<CustomColorSelector />
				{user ? (
					<>
						<Divider className={styles.divider} smallText>
							{t("common:settings.preferences")}
						</Divider>
						<PushNotificationsEnabler />
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
							<PreferenceSelectorSwitch
								_action="DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED"
								defaultSelected={
									user?.preferences.disallowScrimPickupsFromUntrusted ?? false
								}
								label={t(
									"common:settings.DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED.label",
								)}
								bottomText={t(
									"common:settings.DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED.bottomText",
								)}
							/>
							<PreferenceSelectorSwitch
								_action="UPDATE_NO_SCREEN"
								defaultSelected={Boolean(data.noScreen)}
								label={t("common:settings.UPDATE_NO_SCREEN.label")}
								bottomText={t("common:settings.UPDATE_NO_SCREEN.bottomText")}
							/>
						</div>
						<form method="post" action={LOG_OUT_URL} className="mt-6">
							<SendouButton
								size="small"
								variant="outlined"
								icon={<LogOut />}
								type="submit"
							>
								{t("common:header.logout")}
							</SendouButton>
						</form>
					</>
				) : null}
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

const COLOR_SLIDERS = [
	{
		id: "base-hue",
		cssVar: "--base-h",
		defaultValue: 260,
		min: 0,
		max: 360,
		step: 1,
		labelKey: "baseHue",
		isHue: true,
	},
	{
		id: "base-chroma",
		cssVar: "--base-c",
		defaultValue: 0.012,
		min: 0,
		max: 0.1,
		step: 0.001,
		labelKey: "baseChroma",
		isHue: false,
	},
	{
		id: "accent-hue",
		cssVar: "--acc-h",
		defaultValue: 270,
		min: 0,
		max: 360,
		step: 1,
		labelKey: "accentHue",
		isHue: true,
	},
	{
		id: "accent-chroma",
		cssVar: "--acc-c",
		defaultValue: 0.24,
		min: 0,
		max: 0.3,
		step: 0.01,
		labelKey: "accentChroma",
		isHue: false,
	},
] as const;

function useCssVariableState(cssVar: string, defaultValue: number) {
	const [value, setValue] = React.useState(() => {
		if (typeof window === "undefined") return defaultValue;
		return Number(
			getComputedStyle(document.documentElement)
				.getPropertyValue(cssVar)
				.trim() || defaultValue,
		);
	});

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = Number(e.target.value);
		setValue(newValue);
		document.documentElement.style.setProperty(cssVar, String(newValue));
	};

	return [value, handleChange] as const;
}

function ColorSlider({
	id,
	cssVar,
	defaultValue,
	min,
	max,
	step,
	label,
	isHue,
}: {
	id: string;
	cssVar: string;
	defaultValue: number;
	min: number;
	max: number;
	step: number;
	label: string;
	isHue: boolean;
}) {
	const [value, handleChange] = useCssVariableState(cssVar, defaultValue);

	return (
		<div className={styles.colorSlider}>
			<Label htmlFor={id}>{label}</Label>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={handleChange}
				className={isHue ? styles.hueSlider : undefined}
			/>
		</div>
	);
}

function CustomColorSelector() {
	const { t } = useTranslation(["common"]);
	const isSupporter = useHasRole("SUPPORTER");
	const fetcher = useFetcher();

	const handleSave = () => {
		const computedStyle = getComputedStyle(document.documentElement);

		const themeValues = CUSTOM_THEME_VARS.reduce((acc, varDef) => {
			acc[varDef] = Number(computedStyle.getPropertyValue(varDef).trim());

			return acc;
		}, {} as CustomTheme);

		fetcher.submit(
			{ _action: "UPDATE_CUSTOM_THEME", newValue: themeValues },
			{ method: "post", encType: "application/json" },
		);
	};

	const handleReset = () => {
		CUSTOM_THEME_VARS.forEach((varDef: CustomThemeVar) => {
			document.documentElement.style.removeProperty(varDef);
		});

		fetcher.submit(
			{ _action: "UPDATE_CUSTOM_THEME", newValue: null },
			{ method: "post", encType: "application/json" },
		);
	};

	return (
		<div className={styles.customColorSelector}>
			<div
				className={
					isSupporter
						? styles.customColorSelectorSupporter
						: styles.customColorSelectorNoSupporter
				}
			>
				<div className={styles.customColorSelectorInfo}>
					<p>{t("common:settings.customTheme.patreonText")}</p>
					<LinkButton
						to="https://www.patreon.com/sendou"
						isExternal
						size="small"
					>
						{t("common:settings.customTheme.joinPatreon")}
					</LinkButton>
				</div>
			</div>
			<div className={styles.colorSliders}>
				{COLOR_SLIDERS.map((slider) => (
					<ColorSlider
						key={slider.id}
						id={slider.id}
						cssVar={slider.cssVar}
						defaultValue={slider.defaultValue}
						min={slider.min}
						max={slider.max}
						step={slider.step}
						label={t(`common:settings.customTheme.${slider.labelKey}`)}
						isHue={slider.isHue}
					/>
				))}
			</div>
			<div className={styles.customColorSelectorActions}>
				<SendouButton
					isDisabled={!isSupporter || fetcher.state !== "idle"}
					onPress={handleSave}
				>
					{t("common:actions.save")}
				</SendouButton>
				<SendouButton
					isDisabled={!isSupporter || fetcher.state !== "idle"}
					variant="destructive"
					onPress={handleReset}
				>
					{t("common:actions.reset")}
				</SendouButton>
			</div>
		</div>
	);
}

function ClockFormatSelector() {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const fetcher = useFetcher();

	const handleClockFormatChange = (
		event: React.ChangeEvent<HTMLSelectElement>,
	) => {
		const newFormat = event.target.value as "auto" | "24h" | "12h";
		fetcher.submit(
			{ _action: "UPDATE_CLOCK_FORMAT", newValue: newFormat },
			{ method: "post", encType: "application/json" },
		);
	};

	return (
		<div>
			<Label htmlFor="clock-format">{t("common:settings.clockFormat")}</Label>
			<select
				id="clock-format"
				defaultValue={user?.preferences.clockFormat ?? "auto"}
				onChange={handleClockFormatChange}
				disabled={fetcher.state !== "idle"}
			>
				<option value="auto">{t("common:clockFormat.auto")}</option>
				<option value="24h">{t("common:clockFormat.24h")}</option>
				<option value="12h">{t("common:clockFormat.12h")}</option>
			</select>
		</div>
	);
}

// adapted from https://pqvst.com/2023/11/21/web-push-notifications/
function PushNotificationsEnabler() {
	const { t } = useTranslation(["common"]);
	const [notificationsPermsGranted, setNotificationsPermsGranted] =
		React.useState<NotificationPermission | "not-supported">("default");

	React.useEffect(() => {
		if (!("serviceWorker" in navigator)) {
			// Service Worker isn't supported on this browser, disable or hide UI.
			setNotificationsPermsGranted("not-supported");
			return;
		}

		if (!("PushManager" in window)) {
			// Push isn't supported on this browser, disable or hide UI.
			setNotificationsPermsGranted("not-supported");
			return;
		}

		setNotificationsPermsGranted(Notification.permission);
	}, []);

	function askPermission() {
		Notification.requestPermission().then((permission) => {
			setNotificationsPermsGranted(permission);
			if (permission === "granted") {
				initServiceWorker();
			}
		});
	}

	async function initServiceWorker() {
		const swRegistration = await navigator.serviceWorker.register("sw-2.js");
		const subscription = await swRegistration.pushManager.getSubscription();
		if (subscription) {
			sendSubscriptionToServer(subscription);
		} else {
			const subscription = await swRegistration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
			});
			sendSubscriptionToServer(subscription);
		}
	}

	function sendSubscriptionToServer(subscription: PushSubscription) {
		fetch("/notifications/subscribe", {
			method: "post",
			body: JSON.stringify(subscription),
			headers: { "content-type": "application/json" },
		});
	}

	return (
		<div>
			<Label>{t("common:settings.notifications.title")}</Label>
			{notificationsPermsGranted === "granted" ? (
				<SendouPopover
					trigger={
						<SendouButton size="small" variant="minimal">
							{t("common:actions.disable")}
						</SendouButton>
					}
				>
					{t("common:settings.notifications.disableInfo")}
				</SendouPopover>
			) : notificationsPermsGranted === "not-supported" ||
				notificationsPermsGranted === "denied" ? (
				<SendouPopover
					trigger={
						<SendouButton size="small" variant="minimal">
							{t("common:actions.enable")}
						</SendouButton>
					}
				>
					{notificationsPermsGranted === "not-supported"
						? t("common:settings.notifications.browserNotSupported")
						: t("common:settings.notifications.permissionDenied")}
				</SendouPopover>
			) : (
				<SendouButton size="small" variant="minimal" onPress={askPermission}>
					{t("common:actions.enable")}
				</SendouButton>
			)}
			<FormMessage type="info">
				{t("common:settings.notifications.description")}
			</FormMessage>
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
