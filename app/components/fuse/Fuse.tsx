import clsx from "clsx";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { Config } from "~/config";
import { simulateAdsPersisted } from "~/features/dev-tools/dev-tools-persisted";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import type { RootLoaderData } from "~/root";
import styles from "./Fuse.module.css";

declare global {
	interface Window {
		fusetag: {
			que: Array<() => void>;
			pageInit?: () => void;
			registerZone?: (id: string) => void;
		};
	}
}

/** Fuse appends the sticky footer ad as a direct child of `<body>`, its height depends on the served creative. */
export const FUSE_STICKY_FOOTER_SELECTOR =
	".publift-widget-sticky_footer-container";

/** Whether the page lays out ad slots: Fuse is enabled or the dev tools simulate ads, and the viewer isn't a supporter. */
export function useAdsShown(user: RootLoaderData["user"] | undefined) {
	const isSimulating = useIsSimulatingAds();

	if (user?.roles.includes("MINOR_SUPPORT")) return false;

	return Config.fuseEnabled || isSimulating;
}

function callPageInit() {
	window.fusetag = window.fusetag || { que: [] };
	window.fusetag.que.push(() => {
		window.fusetag.pageInit?.();
	});
}

export function FusePageInit() {
	const { pathname } = useLocation();

	useEffect(() => {
		callPageInit();
	}, [pathname]);

	return null;
}

export function FuseZone({
	id,
	fuseSlot,
	className,
}: {
	id: string;
	fuseSlot: string;
	className?: string;
}) {
	const isSimulating = useIsSimulatingAds();

	useEffect(() => {
		window.fusetag = window.fusetag || { que: [] };
		window.fusetag.que.push(() => {
			window.fusetag.registerZone?.(id);
		});
	}, [id]);

	return (
		<div id={id} data-fuse={fuseSlot} className={className}>
			{isSimulating ? (
				<SimulatedAd className={styles.simulatedLeaderboard} label={fuseSlot} />
			) : null}
		</div>
	);
}

/** Dev tools stand-in for the sticky footer ad Fuse appends to `<body>`, matched by the same selector. */
export function SimulatedStickyFooterAd() {
	const isSimulating = useIsSimulatingAds();

	if (!isSimulating) return null;

	return (
		<div
			className={clsx(
				FUSE_STICKY_FOOTER_SELECTOR.slice(1),
				styles.simulatedStickyFooter,
			)}
		>
			<SimulatedAd
				className={styles.simulatedStickyFooterAd}
				label="sticky_footer"
			/>
		</div>
	);
}

const useIsSimulatingAds =
	import.meta.env.DEV && !Config.fuseEnabled
		? () => usePersistedState(simulateAdsPersisted)[0]
		: () => false;

function SimulatedAd({
	className,
	label,
}: {
	className: string;
	label: string;
}) {
	return (
		<div className={clsx(styles.simulatedAd, className)} aria-hidden>
			Ad · {label}
		</div>
	);
}
