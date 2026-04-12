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
	time?: {
		currentMinutes: number;
		totalMinutes: number;
	};
}

export function MatchBannerTopRow({ score, time }: MatchBannerTopRowProps) {
	return (
		<div className={styles.root}>
			<Score score={score} />
			{time ? <Timer time={time} /> : null}
		</div>
	);
}

function Score({ score }: { score: MatchBannerTopRowProps["score"] }) {
	return (
		<div className={styles.values}>
			<div>
				{score.alpha}-{score.bravo}
			</div>
			<div className={styles.sub}>
				{score.isFinal
					? "Final"
					: score.bestOf
						? `Best of ${score.count}`
						: `Play all ${score.count}`}
			</div>
		</div>
	);
}

function Timer({
	time,
}: {
	time: NonNullable<MatchBannerTopRowProps["time"]>;
}) {
	const isHydrated = useHydrated();
	const { i18n } = useTranslation();

	if (!isHydrated) return null;

	const minuteFormatter = new Intl.NumberFormat(i18n.language, {
		style: "unit",
		unit: "minute",
		unitDisplay: "short",
	});
	const hourFormatter = new Intl.NumberFormat(i18n.language, {
		style: "unit",
		unit: "hour",
		unitDisplay: "short",
	});

	const MAX_MINUTES = 60;
	const dateTime = (minutes: number) => `PT0H${minutes}M`;
	const displayValue = (minutes: number) =>
		minutes >= MAX_MINUTES
			? `${hourFormatter.format(1)}+`
			: minuteFormatter.format(minutes);

	return (
		<div className={styles.values}>
			<time dateTime={dateTime(time.currentMinutes)} className={styles.sub}>
				{displayValue(time.currentMinutes)}
			</time>
			<time dateTime={dateTime(time.totalMinutes)}>
				{displayValue(time.totalMinutes)}
			</time>
		</div>
	);
}
