import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { LineChart } from "~/components/LineChart";
import { userSeasonsPage } from "~/features/user-page/user-page-urls";
import { winPercentage } from "~/utils/number";
import * as SeasonPlayerActivity from "../core/SeasonPlayerActivity";
import type { UserSeasonsStatsLoaderData } from "../loaders/u.$identifier.seasons.stats.server";
import styles from "./SeasonPlayersTable.module.css";

type SeasonPlayer = NonNullable<
	UserSeasonsStatsLoaderData["overview"]
>["mates"][number] & {
	setsPerWeek?: NonNullable<
		UserSeasonsStatsLoaderData["players"]
	>["list"][number]["setsPerWeek"];
};

/**
 * Teammates or opponents of a season, a row per player linking to their season.
 * "compact" shows only the set record, "full" also the map record, win rate and sets played per week.
 */
export function SeasonPlayersTable({
	players,
	activityWeeks = [],
	season,
	variant,
}: {
	players: SeasonPlayer[];
	/** Only shown by the "full" variant, with each player's `setsPerWeek` */
	activityWeeks?: number[];
	season: number;
	variant: "compact" | "full";
}) {
	const { t } = useTranslation(["user"]);

	if (players.length === 0) {
		return (
			<div className="text-sm text-lighter text-center italic my-4">
				{t("user:seasons.stats.notEnoughData")}
			</div>
		);
	}

	const showActivity = variant === "full" && activityWeeks.length >= 2;

	return (
		<div
			className={styles.table}
			data-variant={variant}
			data-activity={String(showActivity)}
		>
			{variant === "full" ? (
				<div className={styles.header}>
					<span>{t("user:seasons.stats.players.player")}</span>
					<span className={styles.numeric}>
						{t("user:seasons.summary.sets")}
					</span>
					<span className={clsx(styles.numeric, styles.wideOnly)}>
						{t("user:seasons.summary.maps")}
					</span>
					<span className={clsx(styles.numeric, styles.wideOnly)}>
						{t("user:seasons.stats.players.winRate")}
					</span>
					{showActivity ? (
						<span className={styles.activity}>
							{t("user:seasons.stats.players.activity")}
						</span>
					) : null}
				</div>
			) : null}
			{players.map((player) => {
				const setWinRate = winPercentage(player.setWins, player.setLosses);

				return (
					<Link
						key={player.user.id}
						to={userSeasonsPage({ user: player.user, season })}
						className={styles.row}
					>
						<span className={styles.player}>
							<Avatar user={player.user} size="xxsm" />
							<span className={styles.playerName}>{player.user.username}</span>
						</span>
						<span className={clsx(styles.numeric, "font-semi-bold")}>
							{player.setWins}–{player.setLosses}
						</span>
						{variant === "full" ? (
							<>
								<span className={clsx(styles.numeric, styles.wideOnly)}>
									{player.mapWins}–{player.mapLosses}
								</span>
								<span className={clsx(styles.numeric, styles.wideOnly)}>
									{typeof setWinRate === "number"
										? `${Math.round(setWinRate)}%`
										: "–"}
								</span>
							</>
						) : null}
						{showActivity ? (
							<LineChart
								series={[
									{
										label: t("user:seasons.summary.sets"),
										points: SeasonPlayerActivity.weeklyPoints({
											weeks: activityWeeks,
											setsPerWeek: player.setsPerWeek ?? [],
										}),
									},
								]}
								xAxis={{ type: "date" }}
								area
								sparkline
								className={clsx(styles.activity, styles.sparkline)}
								ariaLabel={t("user:seasons.stats.players.activity")}
							/>
						) : null}
					</Link>
				);
			})}
		</div>
	);
}
