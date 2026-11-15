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
	longestExitLabelLength = 0,
	children,
}: {
	roundId?: number;
	/** Characters in the longest label of where teams leaving the bracket go, shown right of the round's matches. 0 = no labels. */
	longestExitLabelLength?: number;
	children: React.ReactNode;
}) {
	return (
		<div
			className={clsx(styles.elimRoundColumn, {
				[styles.elimRoundColumnWithExits]: longestExitLabelLength > 0,
			})}
			style={
				longestExitLabelLength > 0
					? ({
							"--exit-label-length": longestExitLabelLength,
						} as React.CSSProperties)
					: undefined
			}
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
