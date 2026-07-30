import clsx from "clsx";
import {
	eachDayOfInterval,
	format,
	parseISO,
	startOfDay,
	startOfWeek,
} from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Flag } from "~/components/Flag";
import { TierImage, WeaponImage } from "~/components/Image";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { TierPill } from "~/components/TierPill";
import type { TierName } from "~/features/mmr/mmr-constants";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { stageBannerImageUrl, userSeasonsPage } from "~/utils/urls";
import {
	GRAPHIC_DATE_FORMAT_OPTIONS,
	GraphicContainer,
	GraphicFooter,
	GraphicHeader,
	GraphicPlacementCell,
	type GraphicPlayer,
	GraphicPlayerChip,
	GraphicScore,
	GraphicSectionDivider,
	GraphicSiteUrl,
	GraphicStat,
	GraphicStatsRow,
	GraphicWonLost,
} from "./Graphic";
import graphicStyles from "./Graphic.module.css";
import styles from "./SeasonSummaryGraphic.module.css";

const CHART_WIDTH = 672;
const CHART_HEIGHT = 170;
const CHART_MARGIN = { top: 26, right: 14, bottom: 22, left: 14 };
const CHART_POINTS_NEEDED = 2;
const CHART_PEAK_LABEL_CLAMP = 48;

export type SeasonSummaryGraphicActivity = "sq" | "tournament" | "both";

export interface SeasonSummaryGraphicBestSet {
	opponentPlayers: GraphicPlayer[];
	ownScore: number;
	opponentScore: number;
	/** Average SP of the opposing players at the time the set was played */
	opponentSp: number;
	/** Where the set was played e.g. "SendouQ" or a tournament name */
	context: string;
}

// xxx: tier image looks crispy when exported
// xxx: if user has no weapons reported, the section looks empty. in this case just expand the Top teammates section to take same height as ACTIVITY and have more entries?
// xxx: remove the dot at the end of the graph, looks not good dot at the peak should remain (so if peak at the end then dot there)
// xxx: for top sets, show one unique roster only once test case http://localhost:6173/u/grey/seasons?season=7
export function SeasonSummaryGraphic({
	user,
	season,
	seasonDateRange,
	tier,
	sp,
	setsWon,
	setsLost,
	mapsWon,
	mapsLost,
	longestWinStreak,
	clutch,
	soloRank,
	teamRank,
	topMates,
	bestStage,
	spProgression,
	activeDays,
	bestSets,
	bestTournament,
	topWeapons,
}: {
	user: {
		name: string;
		discordId: string;
		customUrl?: string;
		countryCode?: string;
		avatarUrl?: string;
	};
	season: number;
	seasonDateRange: { starts: Date; ends: Date };
	tier: { name: TierName; isPlus: boolean };
	sp: number;
	setsWon: number;
	setsLost: number;
	mapsWon: number;
	mapsLost: number;
	longestWinStreak: number;
	/** Sets that went to a deciding map: how many of those were won */
	clutch?: { won: number; total: number };
	soloRank?: number;
	teamRank?: {
		rank: number;
		sp: number;
		mates: GraphicPlayer[];
		team?: {
			name: string;
			logoUrl?: string;
		};
	};
	topMates: Array<{
		player: GraphicPlayer;
		avatarUrl?: string;
		setsCount: number;
	}>;
	bestStage?: { stageId: StageId; winratePercentage: number };
	/** Per day peak SP, dates in "yyyy-MM-dd" format */
	spProgression: Array<{ date: string; sp: number }>;
	/** Days with at least one set played, dates in "yyyy-MM-dd" format */
	activeDays: Array<{ date: string; activity: SeasonSummaryGraphicActivity }>;
	bestSets: SeasonSummaryGraphicBestSet[];
	bestTournament?: {
		name: string;
		logoUrl?: string;
		tier?: number;
		placement: number;
		teamsCount: number;
	};
	topWeapons: Array<{ weaponSplId: MainWeaponId; usagePercentage: number }>;
}) {
	const { t } = useTranslation(["user", "calendar", "game-misc"]);

	const peakSp =
		spProgression.length > 0
			? Math.max(...spProgression.map((point) => point.sp))
			: sp;

	return (
		<GraphicContainer>
			<GraphicHeader
				avatarUrl={user.avatarUrl}
				identiconInput={user.name}
				titleRow={
					<>
						{user.countryCode ? (
							<Flag countryCode={user.countryCode} tiny />
						) : null}
						<span className={graphicStyles.headerTitle}>{user.name}</span>
					</>
				}
				subtitle={
					<LocaleTimeRange
						from={seasonDateRange.starts}
						to={seasonDateRange.ends}
						options={GRAPHIC_DATE_FORMAT_OPTIONS}
						className={graphicStyles.headerSubtitle}
					/>
				}
				trailing={
					<div className={styles.seasonBadge}>
						{t("user:seasons.season")} {season}
					</div>
				}
			/>
			<div className={clsx(graphicStyles.box, styles.hero)}>
				<TierImage tier={tier} width={92} />
				<div>
					<div className={styles.heroTierName}>
						{tier.name}
						{tier.isPlus ? "+" : ""}
					</div>
					<div className={styles.heroSp}>{sp.toFixed(1)}SP</div>
					<div className={styles.heroPeak}>
						{t("user:seasons.peak")} {peakSp.toFixed(1)}SP
					</div>
				</div>
				{typeof soloRank === "number" ? (
					<div className={styles.rankBlock}>
						<div className={styles.rankValue}>#{soloRank}</div>
						<div className={graphicStyles.boxLabel}>
							{t("user:seasons.summary.soloRank")}
						</div>
					</div>
				) : null}
			</div>
			{teamRank ? (
				<div className={clsx(graphicStyles.box, styles.teamRankRow)}>
					{teamRank.team ? (
						<Avatar
							url={teamRank.team.logoUrl}
							identiconInput={teamRank.team.name}
							size="sm"
							alt=""
						/>
					) : null}
					<div className={styles.teamRankInfo}>
						<div className={styles.teamRankTitle}>
							{teamRank.team ? (
								<div className={styles.teamRankName}>{teamRank.team.name}</div>
							) : null}
							<div
								className={clsx(styles.teamRankSp, {
									[styles.teamRankSpSecondary]: Boolean(teamRank.team),
								})}
							>
								{teamRank.sp.toFixed(1)}SP
							</div>
						</div>
						<div
							className={clsx(styles.playersInline, styles.playersInlineStart)}
						>
							{teamRank.mates.map((mate) => (
								<GraphicPlayerChip key={mate.name} player={mate} />
							))}
						</div>
					</div>
					<div className={styles.rankBlock}>
						<div className={styles.rankValue}>#{teamRank.rank}</div>
						<div className={graphicStyles.boxLabel}>
							{t("user:seasons.summary.teamRank")}
						</div>
					</div>
				</div>
			) : null}
			<GraphicStatsRow>
				<GraphicStat label={t("user:seasons.summary.sets")}>
					<GraphicWonLost won={setsWon} lost={setsLost} />
				</GraphicStat>
				<GraphicStat label={t("user:seasons.summary.maps")}>
					<GraphicWonLost won={mapsWon} lost={mapsLost} />
				</GraphicStat>
				{clutch && clutch.total > 0 ? (
					<GraphicStat label={t("user:seasons.summary.clutch")}>
						<GraphicWonLost won={clutch.won} lost={clutch.total - clutch.won} />
					</GraphicStat>
				) : null}
				<GraphicStat label={t("user:seasons.summary.winStreak")}>
					{longestWinStreak}
				</GraphicStat>
			</GraphicStatsRow>
			{spProgression.length >= CHART_POINTS_NEEDED ? (
				<div className={graphicStyles.box}>
					<SpChart points={spProgression} />
				</div>
			) : null}
			{bestStage ? (
				<div
					className={clsx(graphicStyles.box, styles.bestStageRow)}
					style={
						{
							"--best-stage-banner": `url(${stageBannerImageUrl(bestStage.stageId)})`,
						} as React.CSSProperties
					}
				>
					<div className={graphicStyles.boxLabel}>
						{t("user:seasons.summary.bestStage")}
					</div>
					<div className={styles.bestStageName}>
						{t(`game-misc:STAGE_${bestStage.stageId}`)}{" "}
						<span className={styles.bestStageWinrate}>
							{Math.round(bestStage.winratePercentage)}%
						</span>
					</div>
				</div>
			) : null}
			<div className={styles.middleGrid}>
				<div className={clsx(graphicStyles.box, styles.activityBox)}>
					<div className={graphicStyles.boxLabel}>
						{t("user:seasons.summary.activity")}
					</div>
					<ActivityCalendar
						seasonDateRange={seasonDateRange}
						activeDays={activeDays}
					/>
					<ActivityLegend />
				</div>
				<div className={styles.sideStack}>
					{topWeapons.length > 0 ? (
						<div className={graphicStyles.box}>
							<div className={graphicStyles.boxLabel}>
								{t("user:seasons.summary.topWeapons")}
							</div>
							<div className={styles.weaponsRow}>
								{topWeapons.map((weapon) => (
									<div key={weapon.weaponSplId} className={styles.weaponUsage}>
										<WeaponImage
											weaponSplId={weapon.weaponSplId}
											variant="badge"
											size={52}
										/>
										<div className={graphicStyles.boxLabel}>
											{Math.round(weapon.usagePercentage)}%
										</div>
									</div>
								))}
							</div>
						</div>
					) : null}
					{topMates.length > 0 ? (
						<div className={graphicStyles.box}>
							<div className={graphicStyles.boxLabel}>
								{t("user:seasons.summary.topMates")}
							</div>
							<div className={styles.matesList}>
								{topMates.map((mate) => (
									<div key={mate.player.name} className={styles.mateRow}>
										<Avatar
											url={mate.avatarUrl}
											identiconInput={mate.player.name}
											size="xxs"
											alt=""
										/>
										<div className={styles.mateName}>
											{mate.player.countryCode ? (
												<Flag countryCode={mate.player.countryCode} tiny />
											) : null}
											<span className={styles.mateNameText}>
												{mate.player.name}
											</span>
										</div>
										<div
											className={clsx(graphicStyles.boxLabel, styles.mateSets)}
										>
											{t("user:seasons.summary.count.sets", {
												count: mate.setsCount,
											})}
										</div>
									</div>
								))}
							</div>
						</div>
					) : null}
				</div>
			</div>
			{bestSets.length > 0 ? (
				<>
					<GraphicSectionDivider>
						{t("user:seasons.summary.bestWins")}
					</GraphicSectionDivider>
					<ol className={styles.bestSetsList}>
						{bestSets.map((set, index) => (
							<li
								key={`${index}-${set.context}`}
								className={clsx(graphicStyles.box, styles.bestSetRow)}
							>
								<GraphicScore
									ownScore={set.ownScore}
									opponentScore={set.opponentScore}
								/>
								<div className={styles.setInfo}>
									<div
										className={clsx(graphicStyles.boxLabel, styles.setContext)}
									>
										{set.context}
									</div>
									<div
										className={clsx(
											styles.playersInline,
											styles.playersInlineStart,
										)}
									>
										{set.opponentPlayers.map((player) => (
											<GraphicPlayerChip key={player.name} player={player} />
										))}
									</div>
								</div>
								<div className={styles.setSp}>
									<div className={styles.setSpValue}>
										{set.opponentSp.toFixed(1)}
									</div>
									<div className={graphicStyles.boxLabel}>
										{t("user:seasons.summary.opponentSp")}
									</div>
								</div>
							</li>
						))}
					</ol>
				</>
			) : null}
			{bestTournament ? (
				<>
					<GraphicSectionDivider>
						{t("user:seasons.summary.bestTournament")}
					</GraphicSectionDivider>
					<div className={clsx(graphicStyles.box, styles.tournamentRow)}>
						<GraphicPlacementCell placement={bestTournament.placement} />
						<Avatar
							url={bestTournament.logoUrl}
							identiconInput={bestTournament.name}
							size="sm"
							alt=""
						/>
						<div className={styles.tournamentInfo}>
							<div className={styles.tournamentName}>{bestTournament.name}</div>
							<div className={styles.tournamentMeta}>
								{t("calendar:count.teams", {
									count: bestTournament.teamsCount,
								})}
							</div>
						</div>
						{typeof bestTournament.tier === "number" ? (
							<TierPill tier={bestTournament.tier} />
						) : null}
					</div>
				</>
			) : null}
			<GraphicFooter>
				<div>
					{t("user:seasons.summary.count.sets", { count: setsWon + setsLost })}{" "}
					·{" "}
					{t("user:seasons.summary.count.maps", { count: mapsWon + mapsLost })}
				</div>
				<GraphicSiteUrl path={userSeasonsPage({ user, season })} />
			</GraphicFooter>
		</GraphicContainer>
	);
}

function SpChart({ points }: { points: Array<{ date: string; sp: number }> }) {
	const { formatter } = useDateTimeFormat({ month: "short", day: "numeric" });
	const gradientId = React.useId();

	const times = points.map((point) => parseISO(point.date).getTime());
	const minTime = times[0];
	const maxTime = times[times.length - 1];
	const sps = points.map((point) => point.sp);
	const minSp = Math.min(...sps);
	const maxSp = Math.max(...sps);

	const innerWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
	const innerHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
	const bottomY = CHART_HEIGHT - CHART_MARGIN.bottom;

	const xAt = (time: number) =>
		CHART_MARGIN.left +
		((time - minTime) / Math.max(maxTime - minTime, 1)) * innerWidth;
	const yAt = (spValue: number) =>
		CHART_MARGIN.top +
		(1 - (spValue - minSp) / Math.max(maxSp - minSp, 1)) * innerHeight;

	const linePath = points
		.map(
			(point, index) =>
				`${index === 0 ? "M" : "L"}${xAt(times[index]).toFixed(1)} ${yAt(point.sp).toFixed(1)}`,
		)
		.join(" ");
	const areaPath = `${linePath} L${xAt(maxTime).toFixed(1)} ${bottomY} L${xAt(minTime).toFixed(1)} ${bottomY} Z`;

	const peakIndex = sps.indexOf(maxSp);
	const peakX = xAt(times[peakIndex]);
	const peakY = yAt(maxSp);
	const peakLabelX = Math.min(
		Math.max(peakX, CHART_PEAK_LABEL_CLAMP),
		CHART_WIDTH - CHART_PEAK_LABEL_CLAMP,
	);
	const lastX = xAt(maxTime);
	const lastY = yAt(points[points.length - 1].sp);

	return (
		<svg
			className={styles.chart}
			viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
			role="img"
			aria-label="SP"
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop
						offset="0"
						style={{ stopColor: "var(--graphic-accent)", stopOpacity: 0.3 }}
					/>
					<stop
						offset="1"
						style={{ stopColor: "var(--graphic-accent)", stopOpacity: 0 }}
					/>
				</linearGradient>
			</defs>
			<line
				className={styles.chartGridLine}
				x1={CHART_MARGIN.left}
				y1={yAt(minSp)}
				x2={CHART_WIDTH - CHART_MARGIN.right}
				y2={yAt(minSp)}
			/>
			<path d={areaPath} fill={`url(#${gradientId})`} />
			<path className={styles.chartLine} d={linePath} />
			<circle className={styles.chartDot} cx={lastX} cy={lastY} r={3.5} />
			<circle className={styles.chartDot} cx={peakX} cy={peakY} r={4.5} />
			<text
				className={styles.chartPeakLabel}
				x={peakLabelX}
				y={peakY - 10}
				textAnchor="middle"
			>
				{maxSp.toFixed(1)}SP
			</text>
			<text
				className={styles.chartLabel}
				x={CHART_MARGIN.left}
				y={CHART_HEIGHT - 6}
			>
				{formatter.format(parseISO(points[0].date))}
			</text>
			<text
				className={styles.chartLabel}
				x={CHART_WIDTH - CHART_MARGIN.right}
				y={CHART_HEIGHT - 6}
				textAnchor="end"
			>
				{formatter.format(parseISO(points[points.length - 1].date))}
			</text>
		</svg>
	);
}

function ActivityCalendar({
	seasonDateRange,
	activeDays,
}: {
	seasonDateRange: { starts: Date; ends: Date };
	activeDays: Array<{ date: string; activity: SeasonSummaryGraphicActivity }>;
}) {
	const activityByDay = new Map(
		activeDays.map((day) => [day.date, day.activity]),
	);
	const seasonFirstDay = startOfDay(seasonDateRange.starts);
	const days = eachDayOfInterval({
		start: startOfWeek(seasonFirstDay, { weekStartsOn: 1 }),
		end: seasonDateRange.ends,
	});

	return (
		<div className={styles.calendar}>
			{days.map((day) => {
				const key = format(day, "yyyy-MM-dd");
				const beforeSeason = day.getTime() < seasonFirstDay.getTime();

				return (
					<div
						key={key}
						className={clsx(
							styles.calendarCell,
							activityClass(activityByDay.get(key)),
							{ [styles.calendarCellHidden]: beforeSeason },
						)}
					/>
				);
			})}
		</div>
	);
}

function ActivityLegend() {
	const { t } = useTranslation(["user"]);

	return (
		<div className={clsx(styles.calendarLegend, graphicStyles.boxLabel)}>
			<div className={styles.calendarLegendItem}>
				<div className={clsx(styles.calendarCell, styles.calendarSq)} />
				SendouQ
			</div>
			<div className={styles.calendarLegendItem}>
				<div className={clsx(styles.calendarCell, styles.calendarTournament)} />
				{t("user:seasons.summary.activity.tournament")}
			</div>
			<div className={styles.calendarLegendItem}>
				<div className={clsx(styles.calendarCell, styles.calendarBoth)} />
				{t("user:seasons.summary.activity.both")}
			</div>
		</div>
	);
}

function activityClass(activity?: SeasonSummaryGraphicActivity) {
	if (!activity) return undefined;

	switch (activity) {
		case "sq":
			return styles.calendarSq;
		case "tournament":
			return styles.calendarTournament;
		case "both":
			return styles.calendarBoth;
	}
}
