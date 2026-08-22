/**
 * Rows of ranked entries (rank, avatar, weapon, name, power) as rendered by the
 * leaderboards and the X Rank top search pages.
 */

import clsx from "clsx";
import type * as React from "react";
import { Link } from "react-router";
import { WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import styles from "./RankTable.module.css";

export function RankTable({ children }: { children: React.ReactNode }) {
	return <div className={styles.table}>{children}</div>;
}

export function RankTableRow({
	to,
	testId,
	children,
}: {
	/** when given the row is a link to the entry's own page */
	to?: string;
	testId?: string;
	children: React.ReactNode;
}) {
	if (!to) {
		return <div className={styles.row}>{children}</div>;
	}

	return (
		<Link to={to} className={styles.row} data-testid={testId}>
			{children}
		</Link>
	);
}

/** Row that separates the rows above and below it, e.g. to mark a cutoff point */
export function RankTableDividerRow({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className={clsx(styles.row, styles.dividerRow)}>{children}</div>;
}

export function RankTableInnerRow({ children }: { children: React.ReactNode }) {
	return <div className={styles.innerRow}>{children}</div>;
}

export function RankTableRank({ children }: { children: React.ReactNode }) {
	return <div className={styles.rank}>{children}</div>;
}

export function RankTableWeaponImage({
	weaponSplId,
}: {
	weaponSplId: MainWeaponId;
}) {
	return (
		<WeaponImage
			className={styles.weapon}
			variant="build"
			weaponSplId={weaponSplId}
			width={32}
			height={32}
		/>
	);
}
