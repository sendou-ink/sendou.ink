import clsx from "clsx";
import {
	ArrowLeft,
	ChartLine,
	Crosshair,
	Handshake,
	MapIcon,
	Swords,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import { EmptyState } from "~/components/EmptyState";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSection } from "~/components/elements/Section";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { ModeImage, StageImage, WeaponImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import { SeasonSelect } from "~/features/mmr/components/SeasonSelect";
import { SeasonSpChart } from "~/features/mmr/components/SeasonSpChart";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import { userSeasonsPage } from "~/features/user-page/user-page-urls";
import { useWeaponUsage } from "~/hooks/swr";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { useSearchParam } from "~/modules/search-params/hooks";
import { invariant } from "~/utils/invariant";
import { cutToNDecimalPlaces, winPercentage } from "~/utils/number";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { SeasonPlayersTable } from "../components/SeasonPlayersTable";
import { SubPageHeader } from "../components/SubPageHeader";
import {
	loader,
	type UserSeasonsStatsLoaderData,
} from "../loaders/u.$identifier.seasons.stats.server";
import { SEASON_STATS_TABS, type SeasonStatsTab } from "../user-page-constants";
import { useUserPageLayoutData } from "../user-page-hooks";
import { userSeasonsStatsSearchParams } from "../user-page-search-params";
import styles from "./u.$identifier.seasons.stats.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["user", "weapons", "game-misc"],
};

export const shouldRevalidate = userSeasonsStatsSearchParams.shouldRevalidate;

const TAB_LABEL_KEYS = {
	overview: "overview",
	stages: "stages",
	weapons: "weapons",
	mates: "teammates",
	enemies: "opponents",
} as const satisfies Record<SeasonStatsTab, string>;

type OverviewData = NonNullable<UserSeasonsStatsLoaderData["overview"]>;

const DAYS_WITH_SKILL_NEEDED_TO_SHOW_POWER_CHART = 2;
const OVERVIEW_WEAPONS_COUNT = 4;
const OVERVIEW_STAGES_COUNT = 8;
const HEATMAP_FEW_MAPS_THRESHOLD = 5;

export default function UserSeasonsStatsPage() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const layoutData = useUserPageLayoutData();
	const [, setSeason] = useSearchParam(userSeasonsStatsSearchParams, "season");

	if (!data) {
		return (
			<div>
				<SubPageHeader user={layoutData.user} title={t("user:seasons")} />
				<EmptyState navItem="sendouq">{t("user:seasons.noSeasons")}</EmptyState>
			</div>
		);
	}

	return (
		<div className={clsx(styles.container, "stack lg")}>
			<SubPageHeader
				user={layoutData.user}
				title={t("user:seasons.stats.title", { season: data.season })}
				subtitle={
					<LinkButton
						to={userSeasonsPage({ user: layoutData.user, season: data.season })}
						variant="minimal"
						size="small"
						icon={<ArrowLeft />}
						className={styles.historyLink}
					>
						{t("user:seasons.history")}
					</LinkButton>
				}
			>
				<div className={styles.seasonSelect}>
					<SeasonSelect
						label={t("user:seasons.season")}
						season={data.season}
						onChange={setSeason}
						isSeasonDisabled={(seasonNth) =>
							!data.seasonsParticipatedIn.includes(seasonNth)
						}
					/>
				</div>
			</SubPageHeader>
			{data.seasonsParticipatedIn.includes(data.season) ? (
				<SeasonStatsTabs />
			) : (
				<EmptyState navItem="sendouq">{t("user:seasons.noQ")}</EmptyState>
			)}
		</div>
	);
}

function SeasonStatsTabs() {
	const { t } = useTranslation(["user"]);
	const data = useStatsLoaderData();
	const [, setTab] = useSearchParam(userSeasonsStatsSearchParams, "tab");

	return (
		<SendouTabs
			selectedKey={data.tab}
			onSelectionChange={(key) => setTab(key as SeasonStatsTab)}
		>
			<SendouTabList>
				{SEASON_STATS_TABS.map((tabKey) => (
					<SendouTab key={tabKey} id={tabKey}>
						{t(`user:seasons.tabs.${TAB_LABEL_KEYS[tabKey]}`)}
					</SendouTab>
				))}
			</SendouTabList>
			<SendouTabPanel id="overview">
				{data.overview ? (
					<Overview overview={data.overview} onShowAll={setTab} />
				) : null}
			</SendouTabPanel>
			<SendouTabPanel id="stages">
				{data.stages ? (
					<SendouSection>
						<StageModeHeatmap stages={data.stages} />
					</SendouSection>
				) : null}
			</SendouTabPanel>
			<SendouTabPanel id="weapons">
				{data.weapons ? (
					<SendouSection>
						<MostPlayedWeapons weapons={data.weapons} showCounts />
					</SendouSection>
				) : null}
			</SendouTabPanel>
			{(["mates", "enemies"] as const).map((playersTab) => (
				<SendouTabPanel key={playersTab} id={playersTab}>
					{data.players ? (
						<SendouSection>
							<SeasonPlayersTable
								players={data.players.list}
								activityWeeks={data.players.activityWeeks}
								season={data.season}
								variant="full"
							/>
						</SendouSection>
					) : null}
				</SendouTabPanel>
			))}
		</SendouTabs>
	);
}

function useStatsLoaderData() {
	const data = useLoaderData<typeof loader>();
	invariant(data);
	return data;
}

function Overview({
	overview,
	onShowAll,
}: {
	overview: OverviewData;
	onShowAll: (tab: SeasonStatsTab) => void;
}) {
	const { t } = useTranslation(["user", "common"]);
	const data = useStatsLoaderData();

	const showAllButton = (tab: SeasonStatsTab) => (
		<SendouButton variant="minimal" size="small" onClick={() => onShowAll(tab)}>
			{t("common:actions.showAll")}
		</SendouButton>
	);

	return (
		<div className="stack lg">
			<KeyStats overview={overview} />
			<div className={styles.chartAndWeapons}>
				<SendouSection title={t("user:seasons.stats.spChart")} icon={ChartLine}>
					{overview.skills.length >=
					DAYS_WITH_SKILL_NEEDED_TO_SHOW_POWER_CHART ? (
						<PowerChart skills={overview.skills} />
					) : (
						<NotEnoughData />
					)}
				</SendouSection>
				<SendouSection
					title={t("user:seasons.stats.mostPlayedWeapons")}
					icon={Crosshair}
					action={overview.weapons.length > 0 ? showAllButton("weapons") : null}
				>
					<MostPlayedWeapons
						weapons={overview.weapons}
						limit={OVERVIEW_WEAPONS_COUNT}
					/>
				</SendouSection>
			</div>
			<SendouSection
				title={t("user:seasons.stats.stageModeWinRates")}
				icon={MapIcon}
				action={showAllButton("stages")}
			>
				<StageModeHeatmap
					stages={overview.stages}
					limit={OVERVIEW_STAGES_COUNT}
				/>
			</SendouSection>
			<div className={styles.playerCards}>
				<SendouSection
					title={t("user:seasons.stats.frequentTeammates")}
					icon={Handshake}
					action={showAllButton("mates")}
				>
					<SeasonPlayersTable
						players={overview.mates}
						season={data.season}
						variant="compact"
					/>
				</SendouSection>
				<SendouSection
					title={t("user:seasons.stats.frequentOpponents")}
					icon={Swords}
					action={showAllButton("enemies")}
				>
					<SeasonPlayersTable
						players={overview.enemies}
						season={data.season}
						variant="compact"
					/>
				</SendouSection>
			</div>
		</div>
	);
}

function NotEnoughData() {
	const { t } = useTranslation(["user"]);

	return (
		<div className="text-sm text-lighter text-center italic my-4">
			{t("user:seasons.stats.notEnoughData")}
		</div>
	);
}

function KeyStats({ overview }: { overview: OverviewData }) {
	const { t } = useTranslation(["user"]);

	const { sets, maps } = overview.winrates;

	return (
		<div className={styles.keyStats}>
			<KeyStat
				label={t("user:seasons.stats.rank")}
				value={
					overview.skill
						? `${overview.skill.tier.name}${overview.skill.tier.isPlus ? "+" : ""}`
						: "–"
				}
				sub={
					overview.skill
						? `${ordinalToSp(overview.skill.ordinal).toFixed(2)}SP · #${overview.skill.leaderboardPlacement}`
						: null
				}
			/>
			<KeyStat
				label={t("user:seasons.summary.sets")}
				value={`${sets.wins}–${sets.losses}`}
				sub={<WinRateSub wins={sets.wins} losses={sets.losses} unit="sets" />}
			/>
			<KeyStat
				label={t("user:seasons.summary.maps")}
				value={`${maps.wins}–${maps.losses}`}
				sub={<WinRateSub wins={maps.wins} losses={maps.losses} unit="maps" />}
			/>
			<KeyStat
				label={t("user:seasons.tournaments")}
				value={String(overview.tournaments.count)}
				sub={
					overview.tournaments.bestPlacement ? (
						<>
							{t("user:seasons.bestFinish")}:{" "}
							<Placement
								placement={overview.tournaments.bestPlacement}
								textOnly
								showAsSuperscript={false}
							/>
						</>
					) : null
				}
			/>
		</div>
	);
}

function KeyStat({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub: React.ReactNode;
}) {
	return (
		<SendouSection title={label}>
			<div className={styles.keyStat}>
				<div className={styles.keyStatValue}>{value}</div>
				{sub ? <div className="text-sm text-lighter">{sub}</div> : null}
			</div>
		</SendouSection>
	);
}

function WinRateSub({
	wins,
	losses,
	unit,
}: {
	wins: number;
	losses: number;
	unit: "sets" | "maps";
}) {
	const { t } = useTranslation(["user"]);

	const winRate = winPercentage(wins, losses);
	if (typeof winRate !== "number") return null;

	return (
		<>
			{t("user:seasons.stats.winRate", { percent: Math.round(winRate) })} ·{" "}
			{t(`user:seasons.summary.count.${unit}`, { count: wins + losses })}
		</>
	);
}

function PowerChart({ skills }: { skills: OverviewData["skills"] }) {
	return (
		<SeasonSpChart
			points={skills.map((skill) => ({
				date: skill.date,
				sp: ordinalToSp(skill.ordinal),
			}))}
			className={styles.powerChart}
			interactive
		/>
	);
}

function MostPlayedWeapons({
	weapons,
	limit,
	showCounts = false,
}: {
	weapons: OverviewData["weapons"];
	limit?: number;
	showCounts?: boolean;
}) {
	const { t } = useTranslation(["user", "weapons"]);

	if (weapons.length === 0) {
		return (
			<div className="text-sm text-lighter text-center italic my-4">
				{t("user:seasons.noReportedWeapons")}
			</div>
		);
	}

	const totalCount = weapons.reduce((acc, cur) => cur.count + acc, 0);

	return (
		<div className="stack md">
			<div
				className={clsx(styles.weaponShares, {
					[styles.weaponSharesGrid]: !limit,
				})}
			>
				{weapons.slice(0, limit).map(({ weaponSplId, count }) => {
					const share = Math.round((count / totalCount) * 100);

					return (
						<div key={weaponSplId} className={styles.weaponShare}>
							<CircleBackdrop>
								<WeaponImage
									weaponSplId={weaponSplId}
									variant="badge"
									size={32}
								/>
							</CircleBackdrop>
							<div className="stack xxs">
								<div className="stack horizontal sm justify-between text-sm">
									<span>{t(`weapons:MAIN_${weaponSplId}`)}</span>
									<span className="text-lighter whitespace-nowrap">
										{showCounts
											? `${t("user:seasons.summary.count.maps", { count })} · `
											: null}
										{share}%
									</span>
								</div>
								<div className={styles.bar}>
									<div style={{ width: `${share}%` }} />
								</div>
							</div>
						</div>
					);
				})}
			</div>
			<div className="text-xs text-lighter">
				{t("user:seasons.stats.weaponsShare")}
			</div>
		</div>
	);
}

function StageModeHeatmap({
	stages,
	limit,
}: {
	stages: OverviewData["stages"];
	limit?: number;
}) {
	const { t } = useTranslation(["user", "game-misc"]);
	const data = useStatsLoaderData();
	const layoutData = useUserPageLayoutData();

	const mapsPlayed = (stageId: StageId) =>
		Object.values(stages[stageId] ?? {}).reduce(
			(acc, cur) => acc + cur.wins + cur.losses,
			0,
		);

	const playedStageIds = stageIds
		.filter((stageId) => mapsPlayed(stageId) > 0)
		.sort((a, b) => mapsPlayed(b) - mapsPlayed(a))
		.slice(0, limit);

	if (playedStageIds.length === 0) {
		return <NotEnoughData />;
	}

	return (
		<div className="stack md">
			<div className={clsx(styles.heatmap, "scrollbar")}>
				<div />
				{modesShort.map((mode) => (
					<div key={mode} className={styles.heatmapModeHeader}>
						<ModeImage mode={mode} size={20} />
						<span>{t(`game-misc:MODE_SHORT_${mode}`)}</span>
					</div>
				))}
				{playedStageIds.map((stageId) => (
					<React.Fragment key={stageId}>
						<div className={styles.heatmapStage}>
							<StageImage stageId={stageId} width={48} className="rounded" />
							<span>{t(`game-misc:STAGE_${stageId}`)}</span>
						</div>
						{modesShort.map((mode) => (
							<HeatmapCell
								key={mode}
								stageId={stageId}
								mode={mode}
								stats={stages[stageId]?.[mode]}
								season={data.season}
								userId={layoutData.user.id}
							/>
						))}
					</React.Fragment>
				))}
			</div>
			<div className="stack horizontal md justify-between flex-wrap text-xs text-lighter">
				<span>{t("user:seasons.stats.clickACell")}</span>
				<span className="stack horizontal sm items-center">
					{t("user:seasons.stats.lower")}
					{(["low", "even", "high"] as const).map((bucket) => (
						<span
							key={bucket}
							className={styles.heatmapLegendSwatch}
							data-bucket={bucket}
						/>
					))}
					{t("user:seasons.stats.higher")}
					<span className="ml-2">
						{t("user:seasons.stats.fewMaps", {
							count: HEATMAP_FEW_MAPS_THRESHOLD,
						})}
					</span>
				</span>
			</div>
		</div>
	);
}

function HeatmapCell({
	stageId,
	mode,
	stats,
	season,
	userId,
}: {
	stageId: StageId;
	mode: ModeShort;
	stats?: { wins: number; losses: number };
	season: number;
	userId: number;
}) {
	const { t } = useTranslation(["user", "game-misc"]);

	const winRate = stats ? winPercentage(stats.wins, stats.losses) : null;

	if (!stats || typeof winRate !== "number") {
		return (
			<div className={clsx(styles.heatmapCell, styles.heatmapCellEmpty)}>–</div>
		);
	}

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					className={styles.heatmapCell}
					data-bucket={winRateBucket(winRate)}
					data-few={String(
						stats.wins + stats.losses < HEATMAP_FEW_MAPS_THRESHOLD,
					)}
					aria-label={`${t(`game-misc:MODE_SHORT_${mode}`)} ${t(`game-misc:STAGE_${stageId}`)}`}
				>
					<span className="font-bold">{Math.round(winRate)}%</span>
					<span className="text-xxs">
						{stats.wins}–{stats.losses}
					</span>
				</SendouButton>
			}
		>
			<StageWeaponUsageStats
				modeShort={mode}
				season={season}
				stageId={stageId}
				userId={userId}
			/>
		</SendouPopover>
	);
}

function winRateBucket(winRate: number) {
	if (winRate >= 60) return "high";
	if (winRate >= 53) return "good";
	if (winRate >= 47) return "even";
	if (winRate >= 40) return "bad";
	return "low";
}

function StageWeaponUsageStats(props: {
	userId: number;
	season: number;
	modeShort: ModeShort;
	stageId: StageId;
}) {
	const { t } = useTranslation(["user", "game-misc"]);
	const [tab, setTab] = React.useState<"SELF" | "MATE" | "ENEMY">("SELF");
	const { weaponUsage, isLoading } = useWeaponUsage(props);

	if (isLoading) {
		return (
			<div
				className={clsx(
					styles.seasonWeaponUsageContainer,
					"items-center justify-center text-lighter p-2",
				)}
			>
				{t("user:seasons.loading")}
			</div>
		);
	}

	const usages = (weaponUsage ?? []).filter((u) => u.type === tab);

	if (usages.length === 0) {
		return (
			<div
				className={clsx(
					styles.seasonWeaponUsageContainer,
					"items-center justify-center text-lighter p-2",
				)}
			>
				{t("user:seasons.noReportedWeapons")}
			</div>
		);
	}

	return (
		<div className={styles.seasonWeaponUsageContainer}>
			<div className="stack horizontal sm text-xs items-center justify-center">
				<ModeImage mode={props.modeShort} width={18} />
				{t(`game-misc:STAGE_${props.stageId}`)}
			</div>
			<SendouTabs
				selectedKey={tab}
				onSelectionChange={(id) => setTab(id as "SELF" | "MATE" | "ENEMY")}
			>
				<SendouTabList>
					<SendouTab id="SELF">{t("user:seasons.tabs.self")}</SendouTab>
					<SendouTab id="MATE">{t("user:seasons.tabs.teammates")}</SendouTab>
					<SendouTab id="ENEMY">{t("user:seasons.tabs.opponents")}</SendouTab>
				</SendouTabList>
				{["SELF", "MATE", "ENEMY"].map((id) => (
					<SendouTabPanel id={id} key={id}>
						<div className={styles.seasonWeaponUsageWeaponsContainer}>
							{usages.map((u) => {
								const winrate = cutToNDecimalPlaces(
									(u.wins / (u.wins + u.losses)) * 100,
								);

								return (
									<div key={u.weaponSplId}>
										<WeaponImage
											weaponSplId={u.weaponSplId}
											variant="build"
											width={48}
											className={styles.seasonWeaponUsageWeapon}
										/>
										<div
											className={clsx("text-xs font-bold", {
												"text-success": winrate >= 50,
												"text-warning": winrate < 50,
											})}
										>
											{winrate}%
										</div>
										<div className="text-xs">
											{u.wins} {t("user:seasons.win.short")}
										</div>
										<div className="text-xs">
											{u.losses} {t("user:seasons.loss.short")}
										</div>
									</div>
								);
							})}
						</div>
					</SendouTabPanel>
				))}
			</SendouTabs>
		</div>
	);
}
