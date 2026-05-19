import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { useUser } from "~/features/auth/core/user";
import { SendouForm } from "~/form/SendouForm";
import {
	disableBuildAbilitySortingSchema,
	disallowScrimPickupsFromUntrustedSchema,
	spoilerFreeModeSchema,
} from "../settings-schemas";

export function PreferencesTab() {
	const user = useUser();
	if (!user) return null;

	return (
		<div className="stack md">
			<PushNotificationsEnabler />
			<div className="mt-6 stack md">
				<SendouForm
					schema={disableBuildAbilitySortingSchema}
					defaultValues={{
						newValue: user.preferences.disableBuildAbilitySorting ?? false,
					}}
					autoSubmit
					revalidateRoot
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
				<SendouForm
					schema={disallowScrimPickupsFromUntrustedSchema}
					defaultValues={{
						newValue:
							user.preferences.disallowScrimPickupsFromUntrusted ?? false,
					}}
					autoSubmit
					revalidateRoot
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
				<SendouForm
					schema={spoilerFreeModeSchema}
					defaultValues={{
						newValue: user.preferences.spoilerFreeMode ?? false,
					}}
					autoSubmit
					revalidateRoot
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
			</div>
		</div>
	);
}

function PushNotificationsEnabler() {
	const { t } = useTranslation(["common"]);
	const [notificationsPermsGranted, setNotificationsPermsGranted] =
		React.useState<NotificationPermission | "not-supported">("default");

	React.useEffect(() => {
		if (!("serviceWorker" in navigator)) {
			setNotificationsPermsGranted("not-supported");
			return;
		}

		if (!("PushManager" in window)) {
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
