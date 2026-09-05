import clsx from "clsx";
import { parse } from "date-fns";
import { useTranslation } from "react-i18next";
import { type MetaFunction, useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { Section } from "~/components/Section";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { loader } from "../loaders/org.$slug.stats.server";
import {
	ESTABLISHED_ORG,
	MONTH_PARAM_FORMAT,
} from "../tournament-organization-constants";
import styles from "./org.$slug.stats.module.css";

export { loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Organization stats",
		location: args.location,
	});
};

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
				<div
					role="progressbar"
					aria-valuenow={averageMonthlyParticipants}
					aria-valuemin={0}
					aria-valuemax={ESTABLISHED_ORG.GAIN_THRESHOLD}
					aria-label={t("org:stats.established.title")}
					className={styles.progress}
				>
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
							style={{
								width: `${Math.min((averageMonthlyParticipants / ESTABLISHED_ORG.GAIN_THRESHOLD) * 100, 100)}%`,
							}}
						/>
					</div>
				</div>
				<div className="text-xs text-lighter">
					{t("org:stats.established.help", {
						months: ESTABLISHED_ORG.MONTHS_CONSIDERED,
						gain: ESTABLISHED_ORG.GAIN_THRESHOLD,
						lose: ESTABLISHED_ORG.LOSE_THRESHOLD,
					})}
				</div>
				<div className={styles.breakdown}>
					{monthlyStats.map((monthStat) => (
						<div
							key={monthStat.month}
							role="progressbar"
							aria-valuenow={monthStat.count}
							aria-valuemin={0}
							aria-valuemax={maxCount}
							aria-label={formatMonth(monthStat.month, formatter)}
							className={styles.breakdownRow}
						>
							<span className={styles.breakdownLabel}>
								{formatMonth(monthStat.month, formatter)}
							</span>
							<div className={styles.breakdownTrack}>
								<div
									className={styles.breakdownBar}
									style={{
										width: `${maxCount > 0 ? Math.min((monthStat.count / maxCount) * 100, 100) : 0}%`,
									}}
								/>
							</div>
							<span className={styles.breakdownCount}>{monthStat.count}</span>
						</div>
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
