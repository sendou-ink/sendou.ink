import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	type ShouldRevalidateFunction,
	useLoaderData,
	useMatches,
} from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { ModeImage, StageImage, WeaponImage } from "~/components/Image";
import { useWeaponUsage } from "~/hooks/swr";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { cutToNDecimalPlaces } from "~/utils/number";
import { isRevalidation } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { userSeasonsPage } from "~/utils/urls";
import {
	loader,
	type UserSeasonsStatsLoaderData,
} from "../loaders/u.$identifier.seasons.stats.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import styles from "../user-page.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["user", "weapons", "game-misc"],
};

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	if (isRevalidation(args)) return args.defaultShouldRevalidate;
	if (args.formMethod === "POST") return args.defaultShouldRevalidate;
	if (args.currentParams.identifier !== args.nextParams.identifier) return true;

	return (
		args.currentUrl.searchParams.get("season") !==
			args.nextUrl.searchParams.get("season") ||
		args.currentUrl.searchParams.get("info") !==
			args.nextUrl.searchParams.get("info")
	);
};

export default function UserSeasonsStats() {
	const data = useLoaderData<typeof loader>();

	if (!data) return null;

	return (
		<div className={styles.seasonInfoContainer}>
			{data.weapons ? <Weapons weapons={data.weapons} /> : null}
			{data.stages ? (
				<Stages stages={data.stages} seasonViewed={data.season} />
			) : null}
			{data.players ? (
				<Players players={data.players} seasonViewed={data.season} />
			) : null}
		</div>
	);
}

const MIN_DEGREE = 5;
const WEAPONS_TO_SHOW = 9;
function Weapons({
	weapons,
}: {
	weapons: NonNullable<UserSeasonsStatsLoaderData["weapons"]>;
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

function Stages({
	seasonViewed,
	stages,
}: {
	seasonViewed: number;
	stages: NonNullable<UserSeasonsStatsLoaderData["stages"]>;
}) {
	const { t } = useTranslation(["user", "game-misc"]);
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as UserPageLoaderData;

	return (
		<div className="stack horizontal justify-center md flex-wrap">
			{stageIds.map((id) => {
				return (
					<div key={id} className="stack sm items-start">
						<StageImage stageId={id} height={48} className="rounded" />
						{modesShort.map((mode) => {
							const stats = stages[id]?.[mode];
							const winPercentage = stats
								? cutToNDecimalPlaces(
										(stats.wins / (stats.wins + stats.losses)) * 100,
									)
								: "";
							const infoText = `${t(`game-misc:MODE_SHORT_${mode}`)} ${t(
								`game-misc:STAGE_${id}`,
							)} ${winPercentage}${winPercentage ? "%" : ""}`;

							return (
								<SendouPopover
									key={mode}
									trigger={
										<SendouButton variant="minimal">
											<div className="stack horizontal items-center xs text-xs font-semi-bold text-main-forced">
												<ModeImage mode={mode} size={18} title={infoText} />
												{stats ? (
													<div>
														{stats.wins}
														{t("user:seasons.win.short")} {stats.losses}
														{t("user:seasons.loss.short")}
													</div>
												) : null}
											</div>
										</SendouButton>
									}
								>
									<StageWeaponUsageStats
										modeShort={mode}
										season={seasonViewed}
										stageId={id}
										userId={layoutData.user.id}
									/>
								</SendouPopover>
							);
						})}
					</div>
				);
			})}
			<div className="text-xs text-lighter font-semi-bold">
				{t("user:seasons.clickARow")}
			</div>
		</div>
	);
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

function Players({
	players,
	seasonViewed,
}: {
	players: NonNullable<UserSeasonsStatsLoaderData["players"]>;
	seasonViewed: number;
}) {
	const { t } = useTranslation(["user"]);

	return (
		<div className="stack md horizontal justify-center flex-wrap">
			{players.map((player) => {
				const setWinRate = Math.round(
					(player.setWins / (player.setWins + player.setLosses)) * 100,
				);
				const mapWinRate = Math.round(
					(player.mapWins / (player.mapWins + player.mapLosses)) * 100,
				);
				return (
					<div key={player.user.id} className="stack">
						<Link
							to={userSeasonsPage({ user: player.user, season: seasonViewed })}
							className={styles.seasonPlayerName}
						>
							<Avatar user={player.user} size="xs" className="mx-auto" />
							{player.user.username}
						</Link>
						<div
							className={clsx("text-xs font-bold", {
								"text-success": setWinRate >= 50,
								"text-warning": setWinRate < 50,
							})}
						>
							{setWinRate}% ({mapWinRate}%)
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
