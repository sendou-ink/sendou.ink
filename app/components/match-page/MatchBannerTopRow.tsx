import styles from "./MatchBannerTopRow.module.css";

export function MatchBannerTopRow({
	score,
	time,
}: {
	score: {
		alpha: number;
		bravo: number;
		isFinal: boolean;
		count: number;
		bestOf: boolean;
	};
	time: {
		currentMinutes: number;
		totalMinutes: number;
	};
}) {
	return <div className={styles.root} />;
}
