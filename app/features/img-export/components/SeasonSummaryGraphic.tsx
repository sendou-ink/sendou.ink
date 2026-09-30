import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Flag } from "~/components/Flag";
import { TierImage, WeaponImage } from "~/components/Image";
import { StageBannerBox } from "~/components/StageBannerBox";
import { TierPill } from "~/components/TierPill";
import {
	type SeasonActivity,
	SeasonActivityCalendar,
} from "~/features/mmr/components/SeasonActivityCalendar";
import { SeasonSpChart } from "~/features/mmr/components/SeasonSpChart";
import type { TierName } from "~/features/mmr/mmr-constants";
import { userSeasonsPage } from "~/features/user-page/user-page-urls";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import {
	GraphicBoxLabel,
	GraphicContainer,
	GraphicDateRangeSubtitle,
	GraphicFooter,
	GraphicHeader,
	GraphicPlacementCell,
	type GraphicPlayer,
	GraphicPlayerChip,
	GraphicQrCodeContext,
	GraphicScore,
	GraphicSectionDivider,
	GraphicSiteUrl,
	GraphicStat,
	GraphicStatsRow,
	GraphicTitle,
	GraphicWonLost,
} from "./Graphic";
import styles from "./SeasonSummaryGraphic.module.css";

const CHART_POINTS_NEEDED = 2;
const TOP_MATES_COUNT = 3;
/** Without weapons the teammates box is alone next to the calendar, so it has room for more */
const TOP_MATES_COUNT_WITHOUT_WEAPONS = 6;

export interface SeasonSummaryGraphicBestSet {
	opponentPlayers: GraphicPlayer[];
	ownScore: number;
	opponentScore: number;
	/** Average SP of the opponents when the set was played */
	opponentSp: number;
	/** Where the set was played e.g. "SendouQ" or a tournament name */
	context: string;
}

export interface SeasonSummaryGraphicStats {
	tier: { name: TierName; isPlus: boolean };
	sp: number;
	setsWon: number;
	setsLost: number;
	mapsWon: number;
	mapsLost: number;
	longestWinStreak: number;
	/** Sets that went to a deciding map */
	clutch?: { won: number; total: number };
	soloRank?: number;
	teamRank?: {
		/** Omitted when the roster is not on the main team leaderboard */
		rank?: number;
		sp: number;
		mates: GraphicPlayer[];
		team?: {
			name: string;
			logoUrl?: string;
		};
	};
	topMates: Array<{
		player: GraphicPlayer;
		discordId: string;
		avatarUrl?: string;
		setsCount: number;
	}>;
	bestStage?: { stageId: StageId; winratePercentage: number };
	/** Highest SP reached during the season */
	peakSp: number;
	/** SP at the end of each day played, dates in "yyyy-MM-dd" format */
	spProgression: Array<{ date: string; sp: number }>;
	/** Days with at least one set played, dates in "yyyy-MM-dd" format */
	activeDays: Array<{ date: string; activity: SeasonActivity }>;
	bestSets: SeasonSummaryGraphicBestSet[];
	bestTournament?: {
		name: string;
		logoUrl?: string;
		tier?: number;
		placement: number;
		teamsCount: number;
	};
	topWeapons: Array<{ weaponSplId: MainWeaponId; usagePercentage: number }>;
}

export function SeasonSummaryGraphic({
	user,
	season,
	seasonDateRange,
	stats,
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
	stats: SeasonSummaryGraphicStats;
}) {
	const { t } = useTranslation(["user", "calendar", "game-misc"]);
	const qrCodeUrl = React.useContext(GraphicQrCodeContext);

	const {
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
		peakSp,
		spProgression,
		activeDays,
		bestSets,
		bestTournament,
		topWeapons,
	} = stats;

	const shownMates = topMates.slice(
		0,
		topWeapons.length > 0 ? TOP_MATES_COUNT : TOP_MATES_COUNT_WITHOUT_WEAPONS,
	);

	return (
		<GraphicContainer>
			<GraphicHeader
				avatarUrl={user.avatarUrl}
				identiconInput={user.discordId}
				titleRow={
					<>
						{user.countryCode ? (
							<Flag countryCode={user.countryCode} tiny />
						) : null}
						<GraphicTitle>{user.name}</GraphicTitle>
					</>
				}
				subtitle={
					<GraphicDateRangeSubtitle
						from={seasonDateRange.starts}
						to={seasonDateRange.ends}
					/>
				}
				trailing={
					<div className={styles.seasonBadge}>
						{t("user:seasons.season")} {season}
					</div>
				}
			/>
			<SummaryBox className={styles.hero}>
				<TierImage tier={tier} width={92} />
				<div>
					<div className={styles.heroTierName}>
						{tier.name}
						{tier.isPlus ? "+" : ""}
					</div>
					<div className={styles.heroSp}>{sp.toFixed(1)}SP</div>
					{peakSp.toFixed(1) === sp.toFixed(1) ? null : (
						<div className={styles.heroPeak}>
							{t("user:seasons.peak")} {peakSp.toFixed(1)}SP
						</div>
					)}
				</div>
				{typeof soloRank === "number" ? (
					<div className={styles.rankBlock}>
						<div className={styles.rankValue}>#{soloRank}</div>
						<GraphicBoxLabel>
							{t("user:seasons.summary.soloRank")}
						</GraphicBoxLabel>
					</div>
				) : null}
			</SummaryBox>
			{teamRank ? (
				<SummaryBox className={styles.teamRankRow}>
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
								<span className={styles.teamRankName}>
									{teamRank.team.name}
								</span>
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
					{typeof teamRank.rank === "number" ? (
						<div className={styles.rankBlock}>
							<div className={styles.rankValue}>#{teamRank.rank}</div>
							<GraphicBoxLabel>
								{t("user:seasons.summary.teamRank")}
							</GraphicBoxLabel>
						</div>
					) : null}
				</SummaryBox>
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
				<SummaryBox>
					<SeasonSpChart points={spProgression} />
				</SummaryBox>
			) : null}
			{bestStage ? (
				<StageBannerBox
					stageId={bestStage.stageId}
					className={clsx(styles.box, styles.bestStageRow)}
				>
					<GraphicBoxLabel>
						{t("user:seasons.summary.bestStage")}
					</GraphicBoxLabel>
					<div className={styles.bestStageName}>
						{t(`game-misc:STAGE_${bestStage.stageId}`)}{" "}
						<span className={styles.bestStageWinrate}>
							{Math.round(bestStage.winratePercentage)}%
						</span>
					</div>
				</StageBannerBox>
			) : null}
			<div className={styles.middleGrid}>
				<SummaryBox>
					<GraphicBoxLabel>
						{t("user:seasons.summary.activity")}
					</GraphicBoxLabel>
					<SeasonActivityCalendar
						seasonDateRange={seasonDateRange}
						activeDays={activeDays}
						className={styles.activityCalendar}
					/>
				</SummaryBox>
				<div className={styles.sideStack}>
					{topWeapons.length > 0 ? (
						<SummaryBox>
							<GraphicBoxLabel>
								{t("user:seasons.summary.topWeapons")}
							</GraphicBoxLabel>
							<div className={styles.weaponsRow}>
								{topWeapons.map((weapon) => (
									<div key={weapon.weaponSplId} className={styles.weaponUsage}>
										<WeaponImage
											weaponSplId={weapon.weaponSplId}
											variant="badge"
											size={52}
										/>
										<GraphicBoxLabel>
											{Math.round(weapon.usagePercentage)}%
										</GraphicBoxLabel>
									</div>
								))}
							</div>
						</SummaryBox>
					) : null}
					{shownMates.length > 0 ? (
						<SummaryBox
							className={clsx({
								[styles.matesBoxExpanded]: topWeapons.length === 0,
							})}
						>
							<GraphicBoxLabel>
								{t("user:seasons.summary.topMates")}
							</GraphicBoxLabel>
							<div className={styles.matesList}>
								{shownMates.map((mate) => (
									<div key={mate.player.name} className={styles.mateRow}>
										<Avatar
											url={mate.avatarUrl}
											identiconInput={mate.discordId}
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
										<GraphicBoxLabel className={styles.mateSets}>
											{t("user:seasons.summary.count.sets", {
												count: mate.setsCount,
											})}
										</GraphicBoxLabel>
									</div>
								))}
							</div>
						</SummaryBox>
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
								className={clsx(styles.box, styles.bestSetRow)}
							>
								<GraphicScore
									ownScore={set.ownScore}
									opponentScore={set.opponentScore}
								/>
								<div className={styles.setInfo}>
									<GraphicBoxLabel className={styles.setContext}>
										{set.context}
									</GraphicBoxLabel>
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
									<GraphicBoxLabel>
										{t("user:seasons.summary.opponentSp")}
									</GraphicBoxLabel>
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
					<SummaryBox className={styles.tournamentRow}>
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
							<TierPill tier={bestTournament.tier} withoutAnimation />
						) : null}
					</SummaryBox>
				</>
			) : null}
			{qrCodeUrl ? null : (
				<GraphicFooter>
					<div>
						{t("user:seasons.summary.count.sets", {
							count: setsWon + setsLost,
						})}{" "}
						·{" "}
						{t("user:seasons.summary.count.maps", {
							count: mapsWon + mapsLost,
						})}
					</div>
					<GraphicSiteUrl path={userSeasonsPage({ user, season })} />
				</GraphicFooter>
			)}
		</GraphicContainer>
	);
}

function SummaryBox({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return <div className={clsx(styles.box, className)}>{children}</div>;
}
