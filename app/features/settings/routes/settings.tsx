import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import { Theme, useTheme } from "~/features/theme/core/provider";
import { FormField } from "~/form/FormField";
import { SelectFormField } from "~/form/fields/SelectFormField";
import { SendouForm } from "~/form/SendouForm";
import { languages } from "~/modules/i18n/config";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, SETTINGS_PAGE } from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import { SendouPopover } from "../../../components/elements/Popover";
import { action } from "../actions/settings.server";
import { loader } from "../loaders/settings.server";
import {
	clockFormatSchema,
	disableBuildAbilitySortingSchema,
	disallowScrimPickupsFromUntrustedSchema,
	updateNoScreenSchema,
} from "../settings-schemas";
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

	// xxx: default values not working?
	return (
		<Main halfWidth>
			<div className="stack md">
				<h2 className="text-lg">{t("common:pages.settings")}</h2>
				<LanguageSelector />
				<ThemeSelector />
				{user ? (
					<SendouForm
						schema={clockFormatSchema}
						defaultValues={{
							newValue: user.preferences.clockFormat ?? "auto",
						}}
						autoSubmit
					>
						{({ names }) => <FormField name={names.newValue} />}
					</SendouForm>
				) : null}
				{user ? (
					<>
						<PushNotificationsEnabler />
						<div className="mt-6 stack md">
							<SendouForm
								schema={disableBuildAbilitySortingSchema}
								defaultValues={{
									newValue:
										user.preferences.disableBuildAbilitySorting ?? false,
								}}
								autoSubmit
							>
								{({ names }) => <FormField name={names.newValue} />}
							</SendouForm>
							<SendouForm
								schema={disallowScrimPickupsFromUntrustedSchema}
								defaultValues={{
									newValue:
										user.preferences.disallowScrimPickupsFromUntrusted ?? false,
								}}
								autoSubmit
							>
								{({ names }) => <FormField name={names.newValue} />}
							</SendouForm>
							<SendouForm
								schema={updateNoScreenSchema}
								defaultValues={{
									newValue: Boolean(data.noScreen),
								}}
								autoSubmit
							>
								{({ names }) => <FormField name={names.newValue} />}
							</SendouForm>
						</div>
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

	const languageItems = languages.map((lang) => ({
		value: lang.code,
		label: lang.name,
	}));

	const handleLanguageChange = (newLang: string | null) => {
		if (!newLang) return;
		navigate(`?${addUniqueParam(searchParams, "lng", newLang).toString()}`);
	};

	return (
		<SelectFormField
			name="lang"
			label={t("common:header.language")}
			items={languageItems}
			value={i18n.language}
			onChange={handleLanguageChange}
		/>
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

	const themeItems = (["auto", Theme.DARK, Theme.LIGHT] as const).map(
		(theme) => ({
			value: theme,
			label: t(`common:theme.${theme}`),
		}),
	);

	const handleThemeChange = (newTheme: string | null) => {
		if (!newTheme) return;
		setUserTheme(newTheme as Theme);
	};

	return (
		<SelectFormField
			name="theme"
			label={t("common:header.theme")}
			items={themeItems}
			value={userTheme ?? "auto"}
			onChange={handleThemeChange}
		/>
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
