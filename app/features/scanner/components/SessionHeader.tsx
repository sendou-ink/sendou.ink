/** The chrome above a session view: the way back to the landing, the view's actions, then whatever the header shows. */
import { ArrowLeft } from "lucide-react";
import type * as React from "react";
import { Link } from "react-router";
import { SCANNER_PAGE } from "~/utils/urls";
import { scannerSearchParams } from "../scanner-search-params";
import styles from "./SessionHeader.module.css";

export function SessionHeader({
	actions,
	children,
}: {
	actions?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.header}>
			<div className={styles.topRow}>
				<Link
					to={scannerSearchParams.href(SCANNER_PAGE, {})}
					className={styles.back}
					aria-label="Back to the scanner"
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

/** `Scanning` — the state word at the head of a status line. */
export function StatusPill({ children }: { children: React.ReactNode }) {
	return <span className={styles.pill}>{children}</span>;
}
