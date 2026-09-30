/**
 * Chrome every detected-event card is built from: the card box with its meta
 * row on top, and the team boxes / player tables the richer cards fill in.
 */

import clsx from "clsx";
import type * as React from "react";
import { WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import styles from "./EventCardShell.module.css";

export function EventCardShell({ children }: { children: React.ReactNode }) {
	return <div className={styles.card}>{children}</div>;
}

/** top row of a card: the event pills, a summary line and the frame thumb */
export function EventCardMeta({ children }: { children: React.ReactNode }) {
	return <div className={styles.meta}>{children}</div>;
}

export function EventCardTeams({
	layout,
	children,
}: {
	/** `solo` hugs a single box, `death` gives one full width box */
	layout?: "solo" | "death";
	children: React.ReactNode;
}) {
	return (
		<div
			className={clsx(styles.teams, {
				[styles.solo]: layout === "solo",
				[styles.death]: layout === "death",
			})}
		>
			{children}
		</div>
	);
}

export function EventCardTeam({
	result,
	children,
}: {
	result?: "win" | "lose";
	children: React.ReactNode;
}) {
	return (
		<div
			className={clsx(styles.team, {
				[styles.win]: result === "win",
				[styles.lose]: result === "lose",
			})}
		>
			{children}
		</div>
	);
}

export function EventCardPlayerTable({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<table className={styles.players}>
			<tbody>{children}</tbody>
		</table>
	);
}

export function EventCardNumberCell({
	children,
}: {
	children: React.ReactNode;
}) {
	return <td className={styles.num}>{children}</td>;
}

export function EventCardWeaponCell({
	children,
}: {
	children: React.ReactNode;
}) {
	return <span className={styles.weaponCell}>{children}</span>;
}

export function EventCardWeaponIcon({
	weaponSplId,
}: {
	weaponSplId: MainWeaponId;
}) {
	return (
		<WeaponImage
			weaponSplId={weaponSplId}
			variant="build"
			size={28}
			className={styles.weaponIcon}
		/>
	);
}
