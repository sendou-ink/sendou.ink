import { clsx } from "clsx";
import { differenceInMinutes } from "date-fns";
import * as React from "react";
import * as Deadline from "../core/Deadline";
import styles from "./MatchTimer.module.css";

interface MatchTimerProps {
	startedAt: Date;
	bestOf: number;
}

export function MatchTimer({ startedAt, bestOf }: MatchTimerProps) {
	const [currentTime, setCurrentTime] = React.useState(new Date());

	React.useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 10000);

		return () => clearInterval(interval);
	}, []);

	const elapsedMinutes = differenceInMinutes(currentTime, startedAt);

	const progressPercentage = Deadline.progressPercentage(
		elapsedMinutes,
		Deadline.totalMatchTime(bestOf),
	);
	const gameMarkers = Deadline.gameMarkers(bestOf);

	return (
		<div>
			<div className={styles.progressContainer}>
				<div
					className={styles.progressBar}
					style={{
						width: `${Math.min(progressPercentage, 100)}%`,
					}}
				/>

				{gameMarkers.map((marker) => (
					<div
						key={marker.gameNumber}
						className={styles.gameMarker}
						style={{ left: `${marker.percentage}%` }}
					>
						<div
							className={clsx(styles.gameMarkerText, styles.gameMarkerLabel)}
						>
							G{marker.gameNumber}
						</div>
						<div className={styles.gameMarkerLine} />
						<div className={clsx(styles.gameMarkerText, styles.gameMarkerTime)}>
							{marker.gameStartMinute}min
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
