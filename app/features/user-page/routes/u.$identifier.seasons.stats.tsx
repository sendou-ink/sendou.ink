import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useMatches } from "react-router";
import { Avatar } from "~/components/Avatar";
import { EmptyState } from "~/components/EmptyState";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
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
import { userPage } from "~/utils/urls";
import { SubPageHeader } from "../components/SubPageHeader";
import {
	loader,
	type UserSeasonsStatsLoaderData,
} from "../loaders/u.$identifier.seasons.stats.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { SEASON_STATS_TABS, type SeasonStatsTab } from "../user-page-constants";
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

const DAYS_WITH_SKILL_NEEDED_TO_SHOW_POWER_CHART = 2;
const POWER_CHART_HEIGHT = 220;
const OVERVIEW_WEAPONS_COUNT = 5;
const OVERVIEW_STAGES_COUNT = 8;
const OVERVIEW_PLAYERS_COUNT = 4;
const OVERVIEW_PLAYER_MIN_SETS = 3;
const HEATMAP_FEW_MAPS_THRESHOLD = 5;

export default function UserSeasonsStatsPage() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const layoutData = useUserPageLayoutData();
	const [tab, setTab] = useSearchParam(userSeasonsStatsSearchParams, "tab");
	const [, setSeason] = useSearchParam(userSeasonsStatsSearchParams, "season");

	if (!data) {
		return (
			<div>
				<SubPageHeader
					user={layoutData.user}
					backTo={userPage(layoutData.user)}
				/>
				<EmptyState navItem="sendouq">{t("user:seasons.noSeasons")}</EmptyState>
			</div>
		);
	}

	return (
		<div className={clsx(styles.container, "stack lg")}>
			<SubPageHeader
				user={layoutData.user}
				backTo={userSeasonsPage({ user: layoutData.user, season: data.season })}
			/>
			<div className="stack horizontal md justify-between items-end flex-wrap">
				<h1 className={styles.heading}>
					{t("user:seasons.stats.title", { season: data.season })}
				</h1>
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
			</div>
			<SendouTabs
				selectedKey={tab}
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
					<Overview onShowAll={setTab} />
				</SendouTabPanel>
				<SendouTabPanel id="stages">
					<StatsCard>
						<StageModeHeatmap stages={data.stages} />
					</StatsCard>
				</SendouTabPanel>
				<SendouTabPanel id="weapons">
					<StatsCard>
						<Weapons weapons={data.weapons} />
					</StatsCard>
				</SendouTabPanel>
				<SendouTabPanel id="mates">
					<StatsCard>
						<Players players={data.mates} />
					</StatsCard>
				</SendouTabPanel>
				<SendouTabPanel id="enemies">
					<StatsCard>
						<Players players={data.enemies} />
					</StatsCard>
				</SendouTabPanel>
			</SendouTabs>
		</div>
	);
}

function useUserPageLayoutData() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	return parentRoute.loaderData as UserPageLoaderData;
}

function useStatsLoaderData() {
	const data = useLoaderData<typeof loader>();
	invariant(data);
	return data;
}

function Overview({ onShowAll }: { onShowAll: (tab: SeasonStatsTab) => void }) {
	const { t } = useTranslation(["user", "common"]);
	const data = useStatsLoaderData();

	const showAllButton = (tab: SeasonStatsTab) => (
		<SendouButton variant="minimal" size="small" onClick={() => onShowAll(tab)}>
			{t("common:actions.showAll")}
		</SendouButton>
	);

	return (
		<div className="stack lg">
			<KeyStats />
			<div className={styles.chartAndWeapons}>
				<StatsCard title={t("user:seasons.stats.spChart")}>
					{data.skills.length >= DAYS_WITH_SKILL_NEEDED_TO_SHOW_POWER_CHART ? (
						<PowerChart skills={data.skills} />
					) : (
						<NotEnoughData />
					)}
				</StatsCard>
				<StatsCard
					title={t("user:seasons.stats.mostPlayedWeapons")}
					action={data.weapons.length > 0 ? showAllButton("weapons") : null}
				>
					<MostPlayedWeapons weapons={data.weapons} />
				</StatsCard>
			</div>
			<StatsCard
				title={t("user:seasons.stats.stageModeWinRates")}
				action={showAllButton("stages")}
			>
				<StageModeHeatmap stages={data.stages} limit={OVERVIEW_STAGES_COUNT} />
			</StatsCard>
			<div className={styles.playerCards}>
				<StatsCard
					title={t("user:seasons.stats.bestTeammates")}
					action={showAllButton("mates")}
				>
					<PlayerHighlights players={data.mates} order="best" />
				</StatsCard>
				<StatsCard
					title={t("user:seasons.stats.toughestOpponents")}
					action={showAllButton("enemies")}
				>
					<PlayerHighlights players={data.enemies} order="worst" />
				</StatsCard>
			</div>
		</div>
	);
}

function StatsCard({
	title,
	action,
	children,
}: {
	title?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className={styles.card}>
			{title ? (
				<div className="stack horizontal sm items-center justify-between">
					<h2 className={styles.cardHeading}>{title}</h2>
					{action}
				</div>
			) : null}
			{children}
		</section>
	);
}

function NotEnoughData() {
	const { t } = useTranslation(["user"]);

	return (
		<div className="text-sm text-lighter text-center my-4">
			{t("user:seasons.stats.notEnoughData")}
		</div>
	);
}

function KeyStats() {
	const { t } = useTranslation(["user"]);
	const data = useStatsLoaderData();

	const { sets, maps } = data.winrates;

	return (
		<dl className={styles.keyStats}>
			<KeyStat
				label={t("user:seasons.stats.rank")}
				value={
					data.currentOrdinal
						? `${data.tier.name}${data.tier.isPlus ? "+" : ""}`
						: "–"
				}
				sub={
					data.currentOrdinal
						? [
								`${ordinalToSp(data.currentOrdinal).toFixed(2)}SP`,
								data.leaderboardPlacement
									? t("user:seasons.leaderboardPlacement", {
											placement: data.leaderboardPlacement,
										})
									: null,
							]
								.filter(Boolean)
								.join(" · ")
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
				value={String(data.tournaments.count)}
				sub={
					data.tournaments.bestPlacement ? (
						<>
							{t("user:seasons.bestFinish")}:{" "}
							<Placement
								placement={data.tournaments.bestPlacement}
								textOnly
								showAsSuperscript={false}
							/>
						</>
					) : null
				}
			/>
		</dl>
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
		<div className={styles.card}>
			<dt className={styles.keyStatLabel}>{label}</dt>
			<dd className={styles.keyStatValue}>{value}</dd>
			{sub ? <dd className="text-sm text-lighter">{sub}</dd> : null}
		</div>
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

function PowerChart({
	skills,
}: {
	skills: UserSeasonsStatsLoaderData["skills"];
}) {
	return (
		<SeasonSpChart
			points={skills.map((skill) => ({
				date: skill.date,
				sp: ordinalToSp(skill.ordinal),
			}))}
			height={POWER_CHART_HEIGHT}
			interactive
		/>
	);
}

function MostPlayedWeapons({
	weapons,
}: {
	weapons: UserSeasonsStatsLoaderData["weapons"];
}) {
	const { t } = useTranslation(["user", "weapons"]);

	if (weapons.length === 0) {
		return (
			<div className="text-sm text-lighter text-center my-4">
				{t("user:seasons.noReportedWeapons")}
			</div>
		);
	}

	const totalCount = weapons.reduce((acc, cur) => cur.count + acc, 0);

	return (
		<div className="stack md">
			{weapons
				.slice(0, OVERVIEW_WEAPONS_COUNT)
				.map(({ weaponSplId, count }) => {
					const share = Math.round((count / totalCount) * 100);

					return (
						<div key={weaponSplId} className={styles.weaponShare}>
							<WeaponImage
								weaponSplId={weaponSplId}
								variant="build"
								size={28}
							/>
							<div className="stack xxs">
								<div className="stack horizontal sm justify-between text-sm">
									<span>{t(`weapons:MAIN_${weaponSplId}`)}</span>
									<span className="text-lighter">{share}%</span>
								</div>
								<div className={styles.bar}>
									<div style={{ width: `${share}%` }} />
								</div>
							</div>
						</div>
					);
				})}
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
	stages: UserSeasonsStatsLoaderData["stages"];
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

type SeasonPlayer = UserSeasonsStatsLoaderData["mates"][number];

function PlayerHighlights({
	players,
	order,
}: {
	players: SeasonPlayer[];
	order: "best" | "worst";
}) {
	const data = useStatsLoaderData();

	const highlighted = players
		.flatMap((player) => {
			const setWinRate = winPercentage(player.setWins, player.setLosses);
			if (
				typeof setWinRate !== "number" ||
				player.setWins + player.setLosses < OVERVIEW_PLAYER_MIN_SETS
			) {
				return [];
			}

			return [{ ...player, setWinRate }];
		})
		.sort((a, b) =>
			order === "best"
				? b.setWinRate - a.setWinRate
				: a.setWinRate - b.setWinRate,
		)
		.slice(0, OVERVIEW_PLAYERS_COUNT);

	if (highlighted.length === 0) {
		return <NotEnoughData />;
	}

	return (
		<div className="stack md">
			{highlighted.map((player) => (
				<Link
					key={player.user.id}
					to={userSeasonsPage({ user: player.user, season: data.season })}
					className={styles.playerRow}
				>
					<Avatar user={player.user} size="xxsm" />
					<span className={styles.playerRowName}>{player.user.username}</span>
					<span className="text-sm text-lighter">
						{player.setWins}–{player.setLosses}
					</span>
					<span
						className={clsx(styles.playerRowWinRate, {
							"text-success": player.setWinRate >= 50,
							"text-warning": player.setWinRate < 50,
						})}
					>
						{Math.round(player.setWinRate)}%
					</span>
				</Link>
			))}
		</div>
	);
}

const MIN_DEGREE = 5;
const WEAPONS_TO_SHOW = 9;
function Weapons({
	weapons,
}: {
	weapons: UserSeasonsStatsLoaderData["weapons"];
}) {
	const { t } = useTranslation(["user", "weapons"]);

	const slicedWeapons = weapons.slice(0, WEAPONS_TO_SHOW);

	const totalCount = weapons.reduce((acc, cur) => cur.count + acc, 0);
	const percentage = (count: number) =>
		cutToNDecimalPlaces((count / totalCount) * 100);
	const countToDegree = (count: number) =>
		Math.max((count / totalCount) * 360, MIN_DEGREE);

	const restCount =
		totalCount - slicedWeapons.reduce((acc, cur) => cur.count + acc, 0);
	const restWeaponsCount = weapons.length - WEAPONS_TO_SHOW;

	return (
		<div className="stack sm horizontal justify-center flex-wrap">
			{weapons.length === 0 ? (
				<div className="text-lighter font-bold my-4">
					{t("user:seasons.noReportedWeapons")}
				</div>
			) : null}
			{slicedWeapons.map(({ count, weaponSplId }) => (
				<WeaponCircle
					key={weaponSplId}
					degrees={countToDegree(count)}
					count={count}
				>
					<WeaponImage
						weaponSplId={weaponSplId}
						variant="build"
						size={42}
						title={`${t(`weapons:MAIN_${weaponSplId}`)} (${percentage(count)}%)`}
					/>
				</WeaponCircle>
			))}
			{restWeaponsCount > 0 ? (
				<WeaponCircle degrees={countToDegree(restCount)}>
					+{restWeaponsCount}
				</WeaponCircle>
			) : null}
		</div>
	);
}

function Players({ players }: { players: SeasonPlayer[] }) {
	const { t } = useTranslation(["user"]);
	const data = useStatsLoaderData();

	if (players.length === 0) {
		return <NotEnoughData />;
	}

	return (
		<div className="stack md horizontal justify-center flex-wrap">
			{players.map((player) => {
				// a player only met on maps of another team's set has no set record
				const setWinRate = winPercentage(player.setWins, player.setLosses);
				const mapWinRate = winPercentage(player.mapWins, player.mapLosses);
				return (
					<div key={player.user.id} className="stack">
						<Link
							to={userSeasonsPage({ user: player.user, season: data.season })}
							className={styles.seasonPlayerName}
						>
							<Avatar user={player.user} size="xs" className="mx-auto" />
							{player.user.username}
						</Link>
						<div
							className={clsx("text-xs font-bold", {
								"text-success":
									typeof setWinRate === "number" && setWinRate >= 50,
								"text-warning":
									typeof setWinRate === "number" && setWinRate < 50,
							})}
						>
							{typeof setWinRate === "number"
								? `${Math.round(setWinRate)}% `
								: null}
							{typeof mapWinRate === "number"
								? `(${Math.round(mapWinRate)}%)`
								: null}
						</div>
						<div className="text-xs">
							{player.setWins} ({player.mapWins}) {t("user:seasons.win.short")}
						</div>
						<div className="text-xs">
							{player.setLosses} ({player.mapLosses}){" "}
							{t("user:seasons.loss.short")}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function WeaponCircle({
	degrees,
	children,
	count,
}: {
	degrees: number;
	children: React.ReactNode;
	count?: number;
}) {
	return (
		<div className={styles.seasonWeaponContainer}>
			<div className={styles.seasonWeaponBorderOuterStatic} />
			<div
				className={styles.seasonWeaponBorderOuter}
				style={{ "--degree": `${degrees}deg` }}
			>
				<div className={styles.seasonWeaponBorderInner}>{children}</div>
			</div>
			{count ? <div className={styles.seasonWeaponCount}>{count}</div> : null}
		</div>
	);
}
