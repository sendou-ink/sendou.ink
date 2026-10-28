import clsx from "clsx";
import { X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useScrollLockWhileOpen } from "~/hooks/useScrollLock";
import styles from "./BottomSheet.module.css";
import { isOwnToggle } from "./Popover";

/**
 * Panel sliding up from the bottom of the screen, above the mobile tab bar so the bar stays usable.
 * A native `popover="auto"` opened by a button with `popoverTarget={id}`: opening another one (e.g. a
 * tab bar panel) closes it, as do Escape and clicks outside. The content mounts on first open.
 */
export function SendouBottomSheet({
	id,
	title,
	icon,
	headerActions,
	footer,
	skipAnimation,
	onToggle,
	children,
}: {
	id: string;
	title: string;
	icon: React.ReactNode;
	/** Rendered after the title, before the close button. */
	headerActions?: React.ReactNode;
	/** Pinned under the scrolling content. */
	footer?: React.ReactNode;
	/** Appear in place, e.g. when taking the place of another sheet that was open. */
	skipAnimation?: boolean;
	onToggle?: (event: React.ToggleEvent<HTMLDivElement>) => void;
	children: React.ReactNode;
}) {
	const ref = React.useRef<HTMLDivElement>(null);
	const [hasOpened, setHasOpened] = React.useState(false);
	const titleId = `${id}-title`;
	useScrollLockWhileOpen(ref);

	return (
		<div
			ref={ref}
			id={id}
			popover="auto"
			role="dialog"
			aria-labelledby={titleId}
			className={clsx(styles.sheet, { [styles.noAnimation]: skipAnimation })}
			onBeforeToggle={(event) => {
				if (isOwnToggle(event) && event.newState === "open") {
					setHasOpened(true);
				}
			}}
			onToggle={onToggle}
		>
			<div className={styles.panelDialog}>
				<header className={styles.header}>
					<div className={styles.icon}>{icon}</div>
					<h2 id={titleId} className={styles.title}>
						{title}
					</h2>
					<div className={styles.headerActions}>{headerActions}</div>
					<SendouBottomSheetCloseButton sheetId={id} />
				</header>
				<div className={clsx(styles.content, "scrollbar")}>
					{hasOpened ? children : null}
				</div>
				{footer ? <div className={styles.footer}>{footer}</div> : null}
			</div>
		</div>
	);
}

/** Closes the popover `sheetId` names, works before hydration too. */
export function SendouBottomSheetCloseButton({ sheetId }: { sheetId: string }) {
	const { t } = useTranslation(["common"]);

	return (
		<button
			type="button"
			className={styles.closeButton}
			popoverTarget={sheetId}
			popoverTargetAction="hide"
			aria-label={t("common:actions.close")}
		>
			<X size={18} />
		</button>
	);
}
