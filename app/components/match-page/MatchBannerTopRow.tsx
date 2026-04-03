import { useTranslation } from "react-i18next";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./MatchBannerTopRow.module.css";

interface MatchBannerTopRowProps {
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
}

export function MatchBannerTopRow({ score, time }: MatchBannerTopRowProps) {
	return (
		<div className={styles.root}>
			<Score score={score} />
			<Timer time={time} />
		</div>
	);
}

function Score({ score }: { score: MatchBannerTopRowProps["score"] }) {
	return (
		<div className={styles.values}>
			<div>
				{score.alpha}-{score.bravo}
			</div>
			<div className={styles.sub}>Final</div>
		</div>
	);
}

function Timer({ time }: { time: MatchBannerTopRowProps["time"] }) {
	const isHydrated = useHydrated();
	const { i18n } = useTranslation();

	if (!isHydrated) return null;

	const formatter = new Intl.NumberFormat(i18n.language, {
		style: "unit",
		unit: "minute",
		unitDisplay: "short",
	});

	const dateTime = (minutes: number) => `PT0H${minutes}M`;

	return (
		<div className={styles.values}>
			<time dateTime={dateTime(time.currentMinutes)} className={styles.sub}>
				{formatter.format(time.currentMinutes)}
			</time>
			<time dateTime={dateTime(time.totalMinutes)}>
				{formatter.format(time.totalMinutes)}
			</time>
		</div>
	);
}
