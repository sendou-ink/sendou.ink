import * as React from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "~/components/elements/Spinner";
import { Image } from "~/components/Image";
import {
	ActivityBadge,
	ActivityButton,
	RecDot,
} from "~/components/layout/ActivityButton";
import { navIconUrl } from "~/utils/urls";
import {
	SCANNER_OVERRIDE_ACTIONS,
	useCapturedBefore,
	useCaptureStatus,
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
 * idle (to start one from any page) once this browser has captured before.
 * The idle button is left out on mobile.
 */
export function ScannerActivity() {
	const overridden = useScannerActivityOverride();
	const captureStatus = useCaptureStatus();
	const capturedBefore = useCapturedBefore();

	const status =
		overridden === undefined ? captureStatus : (overridden?.status ?? null);

	if (status === null) return null;
	if (status === "idle" && overridden === undefined && !capturedBefore) {
		return null;
	}

	return (
		<ScannerButton status={status}>
			{overridden ? (
				<ScannerActivityPanel
					activity={overridden}
					actions={SCANNER_OVERRIDE_ACTIONS}
				/>
			) : (
				<React.Suspense fallback={<Spinner className={styles.spinner} />}>
					<ScannerActivityLive />
				</React.Suspense>
			)}
		</ScannerButton>
	);
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
