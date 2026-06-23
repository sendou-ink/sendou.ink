import clsx from "clsx";
import { parse } from "date-fns";
import { ProgressBar } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { Section } from "~/components/Section";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { loader } from "../loaders/org.$slug.stats.server";
import {
	ESTABLISHED_ORG,
	MONTH_PARAM_FORMAT,
} from "../tournament-organization-constants";
import styles from "./org.$slug.stats.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["org"],
};

export default function OrganizationStatsPage() {
	return (
		<Main className="stack lg">
			<EstablishedStatus />
		</Main>
	);
}

function EstablishedStatus() {
	const { t } = useTranslation(["org"]);
	const { formatter } = useDateTimeFormat({ month: "short", year: "numeric" });
	const { monthlyStats, averageMonthlyParticipants } =
		useLoaderData<typeof loader>();

	const meetsThreshold =
		averageMonthlyParticipants >= ESTABLISHED_ORG.GAIN_THRESHOLD;

	const maxCount = Math.max(
		ESTABLISHED_ORG.GAIN_THRESHOLD,
		...monthlyStats.map((monthStat) => monthStat.count),
	);

	return (
		<Section title={t("org:stats.established.title")}>
			<div className="stack md">
				<ProgressBar
					value={averageMonthlyParticipants}
					minValue={0}
					maxValue={ESTABLISHED_ORG.GAIN_THRESHOLD}
					aria-label={t("org:stats.established.title")}
					className={styles.progress}
				>
					{({ percentage }) => (
						<>
							<div className={styles.progressHeader}>
								<span className={styles.statNumber}>
									{averageMonthlyParticipants.toFixed(1)}
								</span>
								<span className="text-lighter">
									/ {ESTABLISHED_ORG.GAIN_THRESHOLD}
								</span>
							</div>
							<div className={styles.progressTrack}>
								<div
									className={clsx(styles.progressBar, {
										[styles.progressBarMet]: meetsThreshold,
									})}
									style={{ width: `${percentage}%` }}
								/>
							</div>
						</>
					)}
				</ProgressBar>
				<div className="text-xs text-lighter">
					{t("org:stats.established.help", {
						months: ESTABLISHED_ORG.MONTHS_CONSIDERED,
						gain: ESTABLISHED_ORG.GAIN_THRESHOLD,
						lose: ESTABLISHED_ORG.LOSE_THRESHOLD,
					})}
				</div>
				<div className={styles.breakdown}>
					{monthlyStats.map((monthStat) => (
						<ProgressBar
							key={monthStat.month}
							value={monthStat.count}
							minValue={0}
							maxValue={maxCount}
							aria-label={formatMonth(monthStat.month, formatter)}
							className={styles.breakdownRow}
						>
							{({ percentage }) => (
								<>
									<span className={styles.breakdownLabel}>
										{formatMonth(monthStat.month, formatter)}
									</span>
									<div className={styles.breakdownTrack}>
										<div
											className={styles.breakdownBar}
											style={{ width: `${percentage}%` }}
										/>
									</div>
									<span className={styles.breakdownCount}>
										{monthStat.count}
									</span>
								</>
							)}
						</ProgressBar>
					))}
				</div>
			</div>
		</Section>
	);
}

function formatMonth(
	monthString: string,
	formatter: { format: (date: Date | number) => string | null },
) {
	const date = parse(monthString, MONTH_PARAM_FORMAT, new Date());
	return formatter.format(date) ?? undefined;
}
