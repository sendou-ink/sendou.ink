import clsx from "clsx";
import type * as React from "react";
import styles from "./BracketColumns.module.css";

export function BracketColumns({
	roundCount,
	children,
}: {
	roundCount: number;
	children: React.ReactNode;
}) {
	return (
		<div
			className={styles.elimContainer}
			style={{ "--round-count": roundCount } as React.CSSProperties}
		>
			{children}
		</div>
	);
}

export function BracketColumn({
	roundId,
	children,
}: {
	roundId?: number;
	children: React.ReactNode;
}) {
	return (
		<div
			className={styles.elimRoundColumn}
			data-round-id={roundId}
			data-testid="round-column"
		>
			{children}
		</div>
	);
}

export function BracketColumnMatches({
	topBye,
	children,
}: {
	/** pulls the column up so a first round starting with a bye stays aligned */
	topBye?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div
			className={clsx(styles.elimRoundMatchesContainer, {
				[styles.elimRoundMatchesContainerTopBye]: topBye,
			})}
		>
			{children}
		</div>
	);
}
