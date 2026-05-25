import { useTranslation } from "react-i18next";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./MatchBannerTopRow.module.css";

const MAX_MINUTES = 60;

interface MatchBannerTimerProps {
	time: {
		currentMinutes: number;
		totalMinutes: number;
	};
}

export function MatchBannerTimer({ time }: MatchBannerTimerProps) {
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

	const dateTime = (minutes: number) => `PT0H${minutes}M`;
	const displayValue = (minutes: number) =>
		minutes >= MAX_MINUTES
			? `${hourFormatter.format(1)}+`
			: minuteFormatter.format(minutes);

	return (
		<div className={styles.values} data-testid="match-timer">
			<time dateTime={dateTime(time.currentMinutes)} className={styles.sub}>
				{displayValue(time.currentMinutes)}
			</time>
			<time dateTime={dateTime(time.totalMinutes)}>
				{displayValue(time.totalMinutes)}
			</time>
		</div>
	);
}
