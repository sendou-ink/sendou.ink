import * as React from "react";
import { useTranslation } from "react-i18next";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { useUser } from "~/features/auth/core/user";
import {
	findPushSubscription,
	isPushSupported,
	subscribeToPush,
} from "~/features/notifications/core/pushSubscription";
import { SendouForm } from "~/form/SendouForm";
import { useHydrated } from "~/hooks/useHydrated";
import { logger } from "~/utils/logger";
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
			<Divider className="my-2" />
			<div className="stack md">
				<SendouForm
					schema={disableBuildAbilitySortingSchema}
					defaultValues={{
						newValue: user.preferences.disableBuildAbilitySorting ?? false,
					}}
					mode="autoSubmit"
					revalidateRoot
					fullWidth
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
				<SendouForm
					schema={disallowScrimPickupsFromUntrustedSchema}
					defaultValues={{
						newValue:
							user.preferences.disallowScrimPickupsFromUntrusted ?? false,
					}}
					mode="autoSubmit"
					revalidateRoot
					fullWidth
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
				<SendouForm
					schema={spoilerFreeModeSchema}
					defaultValues={{
						newValue: user.preferences.spoilerFreeMode ?? false,
					}}
					mode="autoSubmit"
					revalidateRoot
					fullWidth
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
			</div>
		</div>
	);
}

function PushNotificationsEnabler() {
	const { t } = useTranslation(["common"]);
	const isHydrated = useHydrated();
	const [requestedPermission, setRequestedPermission] =
		React.useState<NotificationPermission | null>(null);
	const [subscribeFailed, setSubscribeFailed] = React.useState(false);
	const [hasSubscription, setHasSubscription] = React.useState<boolean | null>(
		null,
	);
	const subscribeInFlight = React.useRef(false);

	const notificationsPermsGranted: NotificationPermission | "not-supported" =
		requestedPermission ??
		(!isHydrated
			? "default"
			: !isPushSupported()
				? "not-supported"
				: Notification.permission);

	React.useEffect(() => {
		if (notificationsPermsGranted !== "granted") return;

		let cancelled = false;
		findPushSubscription().then((subscription) => {
			if (!cancelled && !subscribeInFlight.current) {
				setHasSubscription(Boolean(subscription));
			}
		});
		return () => {
			cancelled = true;
		};
	}, [notificationsPermsGranted]);

	async function askPermission() {
		const permission = await Notification.requestPermission();
		setRequestedPermission(permission);
		if (permission !== "granted") return;

		subscribeInFlight.current = true;
		try {
			setSubscribeFailed(false);
			await subscribeToPush();
			setHasSubscription(true);
		} catch (err) {
			logger.error("Failed to enable push notifications", err);
			setSubscribeFailed(true);
		} finally {
			subscribeInFlight.current = false;
		}
	}

	return (
		<div>
			<Label>{t("common:settings.notifications.title")}</Label>
			{subscribeFailed ? (
				<SendouButton size="small" variant="minimal" onPress={askPermission}>
					{t("common:actions.enable")}
				</SendouButton>
			) : notificationsPermsGranted === "granted" &&
				hasSubscription === false ? (
				<SendouButton size="small" variant="minimal" onPress={askPermission}>
					{t("common:actions.enable")}
				</SendouButton>
			) : notificationsPermsGranted === "granted" ? (
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
			{subscribeFailed ? (
				<FormMessage type="error">
					{t("common:settings.notifications.subscribeFailed")}
				</FormMessage>
			) : notificationsPermsGranted === "granted" &&
				hasSubscription === false ? (
				<FormMessage type="info">
					{t("common:settings.notifications.resubscribeNeeded")}
				</FormMessage>
			) : null}
			<FormMessage type="info">
				{t("common:settings.notifications.description")}
			</FormMessage>
		</div>
	);
}
