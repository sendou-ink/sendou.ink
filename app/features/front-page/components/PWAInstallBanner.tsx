import { Download } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as v from "valibot";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { APP_ICON_URL } from "~/utils/urls";
import styles from "./PWAInstallBanner.module.css";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallState = "hidden" | "native" | "ios" | "safari";

const SAFARI_MIN_INSTALL_VERSION = 17;

const bannerDismissedPersisted = PersistedState.define({
	key: "pwa-install-banner-dismissed",
	storage: "local",
	schema: v.boolean(),
	default: false,
});

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installStateListeners = new Set<() => void>();

if (typeof window !== "undefined") {
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		deferredInstallPrompt = event as BeforeInstallPromptEvent;
		notifyInstallStateChanged();
	});
	window.addEventListener("appinstalled", () => {
		deferredInstallPrompt = null;
		notifyInstallStateChanged();
	});
}

export function PWAInstallBanner() {
	const { t } = useTranslation(["front", "common"]);
	const installState = useInstallState();

	if (installState === "hidden") return null;

	return (
		<div className={styles.banner}>
			<div className={styles.bannerContent}>
				<h2 className={styles.bannerTitle}>
					{t("front:install.banner.title")}
				</h2>
				<p className="text-xs text-lighter">
					{t("front:install.banner.description")}
				</p>
				<div className="stack horizontal md items-center mt-4">
					<InstallAction installState={installState} />
					<SendouButton
						variant="minimal-destructive"
						size="small"
						onPress={dismissBanner}
					>
						{t("common:actions.dismiss")}
					</SendouButton>
				</div>
			</div>
			<div className={styles.homeScreenIcon}>
				<img
					src={APP_ICON_URL}
					alt=""
					className={styles.homeScreenIconImg}
					draggable="false"
				/>
				<span className={styles.homeScreenIconLabel}>sendou.ink</span>
			</div>
		</div>
	);
}

function InstallAction({
	installState,
}: {
	installState: Exclude<InstallState, "hidden">;
}) {
	const { t } = useTranslation(["front"]);

	const installButton = (
		<SendouButton
			size="small"
			icon={<Download />}
			onPress={
				installState === "native"
					? () => deferredInstallPrompt?.prompt()
					: undefined
			}
		>
			{t("front:install.button")}
		</SendouButton>
	);

	if (installState === "native") {
		return installButton;
	}

	return (
		<SendouDialog
			heading={t("front:install.header")}
			trigger={installButton}
			isDismissable
			showCloseButton
		>
			<ol className={styles.instructionsList}>
				<li>{t(`front:install.${installState}.step1`)}</li>
				<li>{t(`front:install.${installState}.step2`)}</li>
				<li>{t(`front:install.${installState}.step3`)}</li>
			</ol>
		</SendouDialog>
	);
}

function useInstallState(): InstallState {
	const [bannerDismissed] = usePersistedState(bannerDismissedPersisted);
	const promptInstallState = React.useSyncExternalStore(
		subscribeToInstallState,
		getInstallStateSnapshot,
		getServerInstallStateSnapshot,
	);

	return bannerDismissed ? "hidden" : promptInstallState;
}

function subscribeToInstallState(callback: () => void) {
	installStateListeners.add(callback);
	return () => installStateListeners.delete(callback);
}

function dismissBanner() {
	PersistedState.write(bannerDismissedPersisted, true);
}

function getInstallStateSnapshot(): InstallState {
	if (isStandalone()) return "hidden";
	if (deferredInstallPrompt) return "native";
	if (isIos()) return "ios";
	if (isInstallCapableSafariDesktop()) return "safari";
	return "hidden";
}

function getServerInstallStateSnapshot(): InstallState {
	return "hidden";
}

function notifyInstallStateChanged() {
	for (const listener of installStateListeners) {
		listener();
	}
}

function isStandalone() {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		window.matchMedia("(display-mode: tabbed)").matches ||
		(navigator as { standalone?: boolean }).standalone === true
	);
}

function isIos() {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1)
	);
}

function isInstallCapableSafariDesktop() {
	const userAgent = navigator.userAgent;
	const isSafari =
		userAgent.includes("Safari") &&
		!userAgent.includes("Chrome") &&
		!userAgent.includes("Chromium");
	if (!isSafari || !userAgent.includes("Mac")) return false;

	const versionMatch = userAgent.match(/Version\/(\d+)/);
	if (!versionMatch) return false;

	return Number(versionMatch[1]) >= SAFARI_MIN_INSTALL_VERSION;
}
