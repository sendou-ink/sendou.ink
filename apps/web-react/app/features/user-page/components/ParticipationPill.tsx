import clsx from "clsx";
import styles from "./ParticipationPill.module.css";
import type { UserResultsTableProps } from "./UserResultsTable";

export function ParticipationPill({
	setResults,
}: {
	setResults: UserResultsTableProps["results"][number]["setResults"];
}) {
	if (!setResults) {
		return null;
	}

	const playedCount = setResults.filter(Boolean).length;
	const playedPercentage = Math.round((playedCount / setResults.length) * 100);

	return (
		<div className={styles.container}>
			<div className={styles.text}>{playedPercentage}%</div>
			<div className={styles.pill}>
				{setResults.map((result, i) => (
					<div
						key={i}
						className={clsx(styles.pillLine, {
							[styles.participating]: result,
						})}
					/>
				))}
			</div>
		</div>
	);
}
