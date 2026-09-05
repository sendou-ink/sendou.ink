import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import type { PlayableWindowTier, TimeRange } from "../availability-types";
import styles from "./PlayableWindowsSummary.module.css";

type SummaryWindow = TimeRange & { tier: PlayableWindowTier };

/** The playable-window tier as a dot: filled for `FULL`, outlined for one short. */
export function TierDot({
	full,
	className,
	testId,
}: {
	full: boolean;
	className?: string;
	testId?: string;
}) {
	return (
		<span
			className={clsx(styles.tierDot, className, {
				[styles.tierDotFull]: full,
			})}
			data-testid={testId}
		/>
	);
}

/** The week's playable windows as one line per tier, shared by the schedule views. */
export function PlayableWindowsSummary({
	windows,
	minPlayers,
}: {
	windows: Array<SummaryWindow>;
	minPlayers: number;
}) {
	const { t } = useTranslation(["schedule"]);

	const fullWindows = windows.filter((window) => window.tier === "FULL");
	const oneShortWindows = windows.filter(
		(window) => window.tier === "ONE_SHORT",
	);

	return (
		<div className={styles.summary} data-testid="schedule-summary">
			<div className={styles.summaryRow}>
				<TierDot full />
				<span className={styles.summaryLabel}>
					{t("schedule:team.canPlay", { players: minPlayers })}
				</span>
				<WindowList windows={fullWindows} />
			</div>
			{minPlayers > 1 && oneShortWindows.length > 0 ? (
				<div className={styles.summaryRow}>
					<TierDot full={false} />
					<span className={styles.summaryLabel}>
						{t("schedule:team.withSub", { players: minPlayers - 1 })}
					</span>
					<WindowList windows={oneShortWindows} />
				</div>
			) : null}
		</div>
	);
}

function WindowList({ windows }: { windows: Array<SummaryWindow> }) {
	const { t } = useTranslation(["schedule"]);
	const { formatter: windowFormatter } = useDateTimeFormat({
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});

	if (windows.length === 0) {
		return <span className="text-lighter">{t("schedule:team.noWindows")}</span>;
	}

	return (
		<span className={styles.windowList}>
			{windows.map((window) => (
				<span
					key={window.startsAt}
					className={styles.window}
					data-testid="schedule-window"
				>
					{windowFormatter.formatRange(window.startsAt, window.endsAt)}
				</span>
			))}
		</span>
	);
}
