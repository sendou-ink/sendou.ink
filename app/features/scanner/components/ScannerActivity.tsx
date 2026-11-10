import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";
import { Spinner } from "~/components/elements/Spinner";
import { Image } from "~/components/Image";
import {
	ActivityBadge,
	ActivityButton,
	RecDot,
} from "~/components/layout/ActivityButton";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl } from "~/utils/urls";
import {
	type BroadcastTarget,
	SCANNER_OVERRIDE_ACTIONS,
	useCapturedBefore,
	useCaptureStatus,
	useLinkedBroadcast,
	useScannerActivityOverride,
} from "../scanner-activity";
import styles from "./ScannerActivity.module.css";
import { ScannerActivityPanel } from "./ScannerActivityPanel";

const ScannerActivityLive = React.lazy(() =>
	import("./ScannerActivityLive").then((module) => ({
		default: module.ScannerActivityLive,
	})),
);

/**
 * The scanner's capture in the header: shown while one runs or failed, and
 * idle (to start one from any page) once this browser has captured before or
 * was linked to a broadcast, and always on routes asking for it (`showScanner`).
 * The idle button is left out on mobile.
 */
export function ScannerActivity() {
	const overridden = useScannerActivityOverride();
	const captureStatus = useCaptureStatus();
	const capturedBefore = useCapturedBefore();
	const linkedBroadcast = useLinkedBroadcast();
	const matches = useMatches();
	const pageBroadcast = pageBroadcastOf(matches);
	const isScannerRoute =
		pageBroadcast !== null ||
		matches.some(
			(match) => (match.handle as SendouRouteHandle | undefined)?.showScanner,
		);

	const status =
		overridden === undefined ? captureStatus : (overridden?.status ?? null);

	if (status === null) return null;
	if (
		status === "idle" &&
		overridden === undefined &&
		!capturedBefore &&
		!linkedBroadcast &&
		!isScannerRoute
	) {
		return null;
	}

	return (
		<ScannerButton status={status}>
			{overridden ? (
				<ScannerActivityPanel
					activity={overridden}
					actions={SCANNER_OVERRIDE_ACTIONS}
					pageBroadcast={pageBroadcast}
				/>
			) : (
				<React.Suspense fallback={<Spinner className={styles.spinner} />}>
					<ScannerActivityLive pageBroadcast={pageBroadcast} />
				</React.Suspense>
			)}
		</ScannerButton>
	);
}

function pageBroadcastOf(
	matches: ReturnType<typeof useMatches>,
): BroadcastTarget | null {
	for (const match of matches) {
		const handle = match.handle as SendouRouteHandle | undefined;
		if (handle?.scannerBroadcast) return handle.scannerBroadcast(match);
	}

	return null;
}

function ScannerButton({
	status,
	children,
}: {
	status: NonNullable<ReturnType<typeof useCaptureStatus>>;
	children: React.ReactNode;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<ActivityButton
			label={t("common:pages.scanner")}
			icon={<Image path={navIconUrl("scanner")} size={20} alt="" />}
			corner={
				status === "running" ? (
					<RecDot />
				) : status === "error" ? (
					<ActivityBadge kind="error" />
				) : null
			}
			className={status === "idle" ? styles.idle : undefined}
		>
			{children}
		</ActivityButton>
	);
}
