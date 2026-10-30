import clsx from "clsx";
import { X } from "lucide-react";
import * as React from "react";
import { useLocation } from "react-router";
import { SendouPopover } from "../elements/Popover";
import { NotificationDot } from "../NotificationDot";
import styles from "./ActivityButton.module.css";

/**
 * Square header button of one ongoing activity (SendouQ, voice, scanner)
 * opening its panel in a popover. Glanceable state goes in the icon's colour
 * (`tone`), the `corner` badge and the `dot`; navigating closes the popover.
 */
export function ActivityButton({
	label,
	icon,
	corner,
	dot,
	tone,
	className,
	children,
}: {
	label: string;
	icon: React.ReactNode;
	corner?: React.ReactNode;
	dot?: boolean;
	tone?: "success" | "error";
	className?: string;
	children: React.ReactNode;
}) {
	const location = useLocation();
	const [openedAtKey, setOpenedAtKey] = React.useState<string | null>(null);

	return (
		<span className={clsx(styles.item, className)}>
			<SendouPopover
				placement="bottom end"
				isOpen={openedAtKey === location.key}
				onOpenChange={(open) => setOpenedAtKey(open ? location.key : null)}
				trigger={
					<button
						type="button"
						className={clsx(styles.button, {
							[styles.success]: tone === "success",
							[styles.error]: tone === "error",
						})}
						aria-label={label}
						title={label}
					>
						{icon}
					</button>
				}
			>
				{children}
			</SendouPopover>
			{corner ? <span className={styles.corner}>{corner}</span> : null}
			{dot ? <NotificationDot className={styles.dot} /> : null}
		</span>
	);
}

/** Small round badge for an activity's corner or panel header: a count, an alert "!" or an error cross. */
export function ActivityBadge({
	kind,
	children,
}: {
	kind: "count" | "countAction" | "alert" | "error";
	children?: React.ReactNode;
}) {
	return (
		<span
			className={clsx(styles.badge, {
				[styles.countBadge]: kind === "count",
				[styles.countActionBadge]: kind === "countAction",
				[styles.alertBadge]: kind === "alert",
				[styles.errorBadge]: kind === "error",
			})}
		>
			{kind === "alert" ? "!" : kind === "error" ? <X /> : children}
		</span>
	);
}

/** Recording indicator: filled while running, a hollow ring when stopped. */
export function RecDot({ stopped = false }: { stopped?: boolean }) {
	return (
		<span className={clsx(styles.recDot, stopped && styles.recDotStopped)} />
	);
}
