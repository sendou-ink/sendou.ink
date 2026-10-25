import clsx from "clsx";
import { WandSparkles, X } from "lucide-react";
import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import { devToolbarPersisted } from "../dev-tools-persisted";
import type { DevApp } from "../dev-tools-types";
import { eventsDevApp } from "./apps/EventsApp";
import { identityDevApp } from "./apps/IdentityApp";
import { linksDevApp } from "./apps/LinksApp";
import { pageDevApp } from "./apps/PageApp";
import { requestsDevApp } from "./apps/RequestsApp";
import { scenariosDevApp } from "./apps/ScenariosApp";
import { serverDevApp } from "./apps/ServerApp";
import { triggersDevApp } from "./apps/TriggersApp";
import { warningsDevApp } from "./apps/WarningsApp";
import styles from "./DevToolbar.module.css";

/** Grouped by what they are for: setting up state, inspecting the page, controlling the server and browser, links. */
const APP_GROUPS: DevApp[][] = [
	[scenariosDevApp, identityDevApp],
	[pageDevApp, requestsDevApp, eventsDevApp, warningsDevApp],
	[serverDevApp, triggersDevApp, linksDevApp],
];

const APPS = APP_GROUPS.flat();

/** The site's own dark theme with the hue drained from its surfaces, so the toolbar reads as tooling and not as part of the page. */
const DEV_TOOLS_THEME = Object.fromEntries(
	[0, 1, 2, 3, 4, 5, 6, 7].map((index) => [`--_base-c-${index}`, 0]),
) as React.CSSProperties;

/** Development only toolbar along the bottom of every page, see docs/dev/dev-tools.md. */
export function DevToolbar() {
	const [{ isMinimized }, setPersisted] =
		usePersistedState(devToolbarPersisted);
	const [openAppId, setOpenAppId] = React.useState<string | null>(null);
	const openApp = APPS.find((app) => app.id === openAppId);

	const setMinimized = (minimized: boolean) => {
		setPersisted({ isMinimized: minimized });
		if (minimized) setOpenAppId(null);
	};

	React.useEffect(() => {
		for (const app of APPS) app.install?.();
	}, []);

	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && openAppId && !event.defaultPrevented) {
				setOpenAppId(null);
				return;
			}
			if (event.altKey && event.shiftKey && event.code === "KeyD") {
				event.preventDefault();
				setPersisted({ isMinimized: !isMinimized });
				setOpenAppId(null);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [openAppId, isMinimized, setPersisted]);

	if (isMinimized) {
		return (
			<ThemedRoot>
				<button
					type="button"
					className={styles.handle}
					onClick={() => setMinimized(false)}
					aria-label="Show dev tools (Alt+Shift+D)"
					data-tooltip="Dev tools · ⌥⇧D"
				>
					<WandSparkles />
				</button>
			</ThemedRoot>
		);
	}

	return (
		<ThemedRoot>
			{openApp ? (
				<section
					className={clsx(styles.window, {
						[styles.windowLarge]: openApp.size === "lg",
					})}
					aria-label={openApp.title}
				>
					<header className={styles.windowHeader}>
						<span className={styles.windowIcon}>{openApp.icon}</span>
						<div className={styles.windowTitles}>
							<h2 className={styles.windowTitle}>{openApp.title}</h2>
							<p className={styles.windowDescription}>{openApp.description}</p>
						</div>
						<SendouButton
							variant="minimal"
							size="small"
							icon={<X />}
							onClick={() => setOpenAppId(null)}
							aria-label="Close (Esc)"
						/>
					</header>
					<div className={clsx(styles.windowBody, "scrollbar")}>
						<openApp.Component />
					</div>
				</section>
			) : null}

			<nav className={styles.bar} aria-label="Dev tools">
				{APP_GROUPS.map((group, index) => (
					<React.Fragment key={group[0].id}>
						{index > 0 ? <span className={styles.divider} aria-hidden /> : null}
						{group.map((app) => (
							<button
								key={app.id}
								type="button"
								className={styles.appButton}
								aria-pressed={openAppId === app.id}
								aria-label={app.title}
								data-tooltip={app.title}
								onClick={() =>
									setOpenAppId((current) =>
										current === app.id ? null : app.id,
									)
								}
							>
								{app.icon}
								{app.badge}
							</button>
						))}
					</React.Fragment>
				))}
				<span className={styles.divider} aria-hidden />
				<button
					type="button"
					className={styles.appButton}
					onClick={() => setMinimized(true)}
					aria-label="Hide dev tools (Alt+Shift+D)"
					data-tooltip="Hide · ⌥⇧D"
				>
					<span className={styles.minimizeIcon} aria-hidden />
				</button>
			</nav>
		</ThemedRoot>
	);
}

/** `data-default-theme` opts out of the viewer's custom theme, the base chroma override then drains the hue. */
function ThemedRoot({ children }: { children: React.ReactNode }) {
	return (
		<div
			className={styles.root}
			data-theme="dark"
			data-default-theme
			style={DEV_TOOLS_THEME}
		>
			{children}
		</div>
	);
}
