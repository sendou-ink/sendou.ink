import clsx from "clsx";
import * as R from "remeda";
import {
	type PlanDocument,
	SLOTS_PER_TEAM,
	type TeamIndex,
} from "../core/PlanDocument";
import styles from "./SlotBar.module.css";

const TEAMS: TeamIndex[] = [0, 1];

/** The eight player slots, team A's four on the left and team B's on the right. */
export function SlotBar({
	document,
	className,
}: {
	document: PlanDocument;
	className?: string;
}) {
	return (
		<div className={clsx(styles.slotBar, className)}>
			{TEAMS.map((team) => (
				<div
					key={team}
					className={styles.team}
					style={{ "--team-color": document.teams[team].color }}
				>
					{R.range(0, SLOTS_PER_TEAM).map((index) => (
						<div key={index} className={styles.slot} />
					))}
				</div>
			))}
		</div>
	);
}
