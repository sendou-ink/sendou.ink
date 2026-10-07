/** The chrome above a session view: the way back (to the landing unless `back` says otherwise), the view's actions, then whatever the header shows. */
import clsx from "clsx";
import { ArrowLeft } from "lucide-react";
import type * as React from "react";
import { Link } from "react-router";
import { SCANNER_PAGE } from "~/utils/urls";
import { scannerSearchParams } from "../scanner-search-params";
import styles from "./SessionHeader.module.css";

export function SessionHeader({
	back = {
		to: scannerSearchParams.href(SCANNER_PAGE, {}),
		label: "Back to the scanner",
	},
	actions,
	children,
}: {
	back?: { to: string; label: string };
	actions?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.header}>
			<div className={styles.topRow}>
				<Link
					to={back.to}
					className={styles.back}
					aria-label={back.label}
					defaultShouldRevalidate={false}
				>
					<ArrowLeft className={styles.backIcon} />
				</Link>
				<div className={styles.actions}>{actions}</div>
			</div>
			{children}
		</div>
	);
}

/** `Scanning` — the state word at the head of a status line; `success` for a finished one. */
export function StatusPill({
	tone = "info",
	children,
}: {
	tone?: "info" | "success";
	children: React.ReactNode;
}) {
	return (
		<span
			className={clsx(styles.pill, {
				[styles.pillSuccess]: tone === "success",
			})}
		>
			{children}
		</span>
	);
}
