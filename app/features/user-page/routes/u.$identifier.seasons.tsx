import {
	Link,
	useLoaderData,
	useMatches,
	useNavigate,
	useSearchParams,
} from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import Chart from "~/components/Chart";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouPopover } from "~/components/elements/Popover";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import {
	ModeImage,
	StageImage,
	TierImage,
	WeaponImage,
} from "~/components/Image";
import { Pagination } from "~/components/Pagination";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { TopTenPlayer } from "~/features/leaderboards/components/TopTenPlayer";
import { playerTopTenPlacement } from "~/features/leaderboards/leaderboards-utils";
import * as Seasons from "~/features/mmr/core/Seasons";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import type {
	SeasonGroupMatch,
	SeasonTournamentResult,
} from "~/features/sendouq-match/QMatchRepository.server";
import { useWeaponUsage } from "~/hooks/swr";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { cutToNDecimalPlaces, roundToNDecimalPlaces } from "~/utils/number";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	sendouQMatchPage,
	TIERS_PAGE,
	tournamentTeamPage,
	userSeasonsPage,
} from "~/utils/urls";
import {
	loader,
	type UserSeasonsPageLoaderData,
} from "../loaders/u.$identifier.seasons.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["user"],
};

const DAYS_WITH_SKILL_NEEDED_TO_SHOW_POWER_CHART = 2;
export default function UserSeasonsPage() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	if (!data) {
		return (
			<div className="text-lg text-lighter font-semi-bold text-center mt-2">
				{t("user:seasons.noSeasons")}
			</div>
		);
	}

	if (data.results.value.length === 0) {
		return (
			<div className="stack lg half-width">
				<SeasonHeader
					seasonViewed={data.season}
					seasonsParticipatedIn={data.seasonsParticipatedIn}
				/>
				<div className="text-lg text-lighter font-semi-bold text-center mt-2">
					{t("user:seasons.noQ")}
				</div>
			</div>
		);
	}

	const tabLink = (tab: string) =>
		`?info=${tab}&page=${data.results.currentPage}&season=${data.season}`;

	return (
		<div className="stack lg half-width">
			<SeasonHeader
				seasonViewed={data.season}
				seasonsParticipatedIn={data.seasonsParticipatedIn}
			/>
			{data.currentOrdinal ? (
				<div className="stack md">
					<Rank
						currentOrdinal={data.currentOrdinal}
						seasonViewed={data.season}
						isAccurateTiers={data.isAccurateTiers}
						skills={data.skills}
						tier={data.tier}
					/>
					{data.winrates.maps.wins + data.winrates.maps.losses > 0 ? (
						<Winrates winrates={data.winrates} />
					) : null}
					{data.skills.length >= DAYS_WITH_SKILL_NEEDED_TO_SHOW_POWER_CHART ? (
						<PowerChart skills={data.skills} />
					) : null}
				</div>
			) : null}
			<div className="mt-4">
				<SubNav secondary>
					<SubNavLink
						to={tabLink("weapons")}
						secondary
						controlled
						active={data.info.currentTab === "weapons"}
					>
						{t("user:seasons.tabs.weapons")}
					</SubNavLink>
					<SubNavLink
						to={tabLink("stages")}
						secondary
						controlled
						active={data.info.currentTab === "stages"}
					>
						{t("user:seasons.tabs.stages")}
					</SubNavLink>
					<SubNavLink
						to={tabLink("mates")}
						secondary
						controlled
						active={data.info.currentTab === "mates"}
					>
						{t("user:seasons.tabs.teammates")}
					</SubNavLink>
					<SubNavLink
						to={tabLink("enemies")}
						secondary
						controlled
						active={data.info.currentTab === "enemies"}
					>
						{t("user:seasons.tabs.opponents")}
					</SubNavLink>
				</SubNav>
				<div className="u__season__info-container">
					{data.info.weapons ? <Weapons weapons={data.info.weapons} /> : null}
					{data.info.stages ? (
						<Stages stages={data.info.stages} seasonViewed={data.season} />
					) : null}
					{data.info.players ? (
						<Players players={data.info.players} seasonViewed={data.season} />
					) : null}
				</div>
			</div>
			{data.canceled ? (
				<CanceledMatchesDialog canceledMatches={data.canceled} />
			) : null}
			<Results results={data.results} seasonViewed={data.season} />
		</div>
	);
}

function SeasonHeader({
	seasonViewed,
	seasonsParticipatedIn,
}: {
	seasonViewed: number;
	seasonsParticipatedIn: number[];
}) {
	const { t } = useTranslation(["user"]);
	const { formatDate } = useTimeFormat();
	const isMounted = useIsMounted();
	const { starts, ends } = Seasons.nthToDateRange(seasonViewed);
	const navigate = useNavigate();
	const options = useSeasonSelectOptions();

	const isDifferentYears =
		new Date(starts).getFullYear() !== new Date(ends).getFullYear();

	return (
		<div>
			<SendouSelect
				label={t("user:seasons.season")}
				selectedKey={seasonViewed}
				onSelectionChange={(seasonNth) => navigate(`?season=${seasonNth}`)}
				items={options}
				className="u__season__select"
				popoverClassName="u__season__select"
			>
				{({ year, items, key }) => (
					<SendouSelectItemSection heading={year} key={key}>
						{items.map((item) => (
							<SendouSelectItem
								key={item.key}
								id={item.seasonNth}
								isDisabled={!seasonsParticipatedIn.includes(item.seasonNth)}
							>
								{item.name}
							</SendouSelectItem>
						))}
					</SendouSelectItemSection>
				)}
			</SendouSelect>
			<div
				className={clsx("text-sm text-lighter mt-2", { invisible: !isMounted })}
			>
				{isMounted ? (
					<>
						{formatDate(new Date(starts), {
							day: "numeric",
							month: "long",
							year: isDifferentYears ? "numeric" : undefined,
						})}{" "}
						-{" "}
						{formatDate(new Date(ends), {
							day: "numeric",
							month: "long",
							year: "numeric",
						})}
					</>
				) : (
					"0"
				)}
			</div>
		</div>
	);
}

function useSeasonSelectOptions() {
	const { t } = useTranslation(["user"]);

	const seasonSelectItems = Seasons.allStarted().map((seasonNth) => ({
		seasonNth,
		key: seasonNth,
		name: `${t("user:seasons.season")} ${seasonNth}`,
	}));

	const groupedSeasonItems = seasonSelectItems.reduce(
		(acc, item) => {
			const year = Seasons.nthToDateRange(item.seasonNth).starts.getFullYear();
			if (!acc[year]) {
				acc[year] = [];
			}
			acc[year].push(item);
			return acc;
		},
		{} as Record<number, typeof seasonSelectItems>,
	);

	return Object.entries(groupedSeasonItems)
		.sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
		.map(([year, items]) => ({
			year,
			items: items.sort((a, b) => b.seasonNth - a.seasonNth),
			key: year,
		}));
}

function Winrates({
	winrates,
}: {
	winrates: UserSeasonsPageLoaderData["winrates"];
}) {
	const { t } = useTranslation(["user"]);

	const winrate = (wins: number, losses: number) =>
		Math.round((wins / (wins + losses)) * 100);

	return (
		<div className="stack horizontal sm">
			<div className="u__season__winrate">
				<span className="text-theme text-xxs">Sets</span> {winrates.sets.wins}
				{t("user:seasons.win.short")} {winrates.sets.losses}
				{t("user:seasons.loss.short")} (
				{winrate(winrates.sets.wins, winrates.sets.losses)}%)
			</div>
			<div className="u__season__winrate">
				<span className="text-theme text-xxs">Maps</span> {winrates.maps.wins}
				{t("user:seasons.win.short")} {winrates.maps.losses}
				{t("user:seasons.loss.short")} (
				{winrate(winrates.maps.wins, winrates.maps.losses)}%)
			</div>
		</div>
	);
}

function Rank({
	currentOrdinal,
	seasonViewed,
	tier,
	isAccurateTiers,
	skills,
}: {
	currentOrdinal: number;
	seasonViewed: number;
	tier: UserSeasonsPageLoaderData["tier"];
	isAccurateTiers: UserSeasonsPageLoaderData["isAccurateTiers"];
	skills: UserSeasonsPageLoaderData["skills"];
}) {
	const { t } = useTranslation(["user"]);
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;

	const maxOrdinal = Math.max(...skills.map((s) => s.ordinal));

	const peakAndCurrentSame = currentOrdinal === maxOrdinal;

	const topTenPlacement = playerTopTenPlacement({
		season: seasonViewed,
		userId: layoutData.user.id,
	});

	return (
		<div className="stack horizontal items-center justify-center sm">
			<TierImage tier={tier} />
			<div>
				<Link to={TIERS_PAGE} className="text-xl font-bold">
					{tier.name}
					{tier.isPlus ? "+" : ""}
				</Link>
				{!isAccurateTiers ? (
					<div className="u__season__tentative">
						{t("user:seasons.tentative")}{" "}
						<SendouPopover
							popoverClassName="u__season__tentative__explanation"
							trigger={
								<SendouButton variant="minimal" className="ml-1">
									?
								</SendouButton>
							}
						>
							{t("user:seasons.tentative.explanation")}
						</SendouPopover>
					</div>
				) : null}
				<div className="text-lg font-bold">
					{ordinalToSp(currentOrdinal).toFixed(2)}SP
				</div>
				{!peakAndCurrentSame ? (
					<div className="text-lighter text-sm">
						{t("user:seasons.peak")} {ordinalToSp(maxOrdinal).toFixed(2)}SP
					</div>
				) : null}
				{topTenPlacement ? (
					<TopTenPlayer
						small
						placement={topTenPlacement}
						season={seasonViewed}
					/>
				) : null}
			</div>
		</div>
	);
}

function PowerChart({
	skills,
}: {
	skills: UserSeasonsPageLoaderData["skills"];
}) {
	const chartOptions = React.useMemo(() => {
		return [
			{
				label: "SP",
				data: skills.map((s) => {
					return {
						primary: new Date(s.date),
						secondary: ordinalToSp(s.ordinal),
					};
				}),
			},
		];
	}, [skills]);

	return <Chart options={chartOptions as any} xAxis="localTime" />;
}

const MIN_DEGREE = 5;
const WEAPONS_TO_SHOW = 9;
function Weapons({
	weapons,
}: {
	weapons: NonNullable<UserSeasonsPageLoaderData["info"]["weapons"]>;
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
						title={`${t(`weapons:MAIN_${weaponSplId}`)} (${percentage(
							count,
						)}%)`}
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
	stages: NonNullable<UserSeasonsPageLoaderData["info"]["stages"]>;
}) {
	const { t } = useTranslation(["user", "game-misc"]);
	const layoutData = useMatches().at(-2)!.data as UserPageLoaderData;

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
			<div className="u__season__weapon-usage__container items-center justify-center text-lighter p-2">
				{t("user:seasons.loading")}
			</div>
		);
	}

	const usages = (weaponUsage ?? []).filter((u) => u.type === tab);

	if (usages.length === 0) {
		return (
			<div className="u__season__weapon-usage__container items-center justify-center text-lighter p-2">
				{t("user:seasons.noReportedWeapons")}
			</div>
		);
	}

	return (
		<div className="u__season__weapon-usage__container">
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
						<div className="u__season__weapon-usage__weapons-container">
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
											className="u__season__weapon-usage__weapon"
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
	players: NonNullable<UserSeasonsPageLoaderData["info"]["players"]>;
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
							className="u__season__player-name"
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
		<div className="u__season__weapon-container">
			<div className="u__season__weapon-border__outer-static" />
			<div
				className="u__season__weapon-border__outer"
				style={{ "--degree": `${degrees}deg` }}
			>
				<div className="u__season__weapon-border__inner">{children}</div>
			</div>
			{count ? <div className="u__season__weapon-count">{count}</div> : null}
		</div>
	);
}

/** Dialog for staff view all season's canceled matches per user */
function CanceledMatchesDialog({
	canceledMatches,
}: {
	canceledMatches: NonNullable<UserSeasonsPageLoaderData["canceled"]>;
}) {
	const { formatDateTime } = useTimeFormat();

	return (
		<SendouDialog
			trigger={
				<SendouButton
					variant="minimal"
					isDisabled={canceledMatches.length === 0}
				>
					Canceled Matches ({canceledMatches.length})
				</SendouButton>
			}
			heading="Season's canceled matches for this user"
		>
			<div className="stack lg">
				{canceledMatches.map((match) => (
					<div key={match.id}>
						<Link to={sendouQMatchPage(match.id)}>#{match.id}</Link>
						<div>
							{formatDateTime(databaseTimestampToDate(match.createdAt))}
						</div>
					</div>
				))}
			</div>
		</SendouDialog>
	);
}

function Results({
	seasonViewed,
	results,
}: {
	seasonViewed: number;
	results: UserSeasonsPageLoaderData["results"];
}) {
	const isMounted = useIsMounted();
	const { formatDate } = useTimeFormat();
	const [, setSearchParams] = useSearchParams();
	const ref = React.useRef<HTMLDivElement>(null);

	const setPage = (page: number) => {
		setSearchParams({ page: String(page), season: String(seasonViewed) });
	};

	React.useEffect(() => {
		if (results.currentPage === 1) return;
		ref.current?.scrollIntoView({
			block: "center",
		});
	}, [results.currentPage]);

	let lastDayRendered: number | null = null;
	return (
		<div>
			<div ref={ref} />
			<div className="stack lg">
				<div className="stack">
					{results.value.map((result) => {
						const day = databaseTimestampToDate(result.createdAt).getDate();
						const shouldRenderDateHeader = day !== lastDayRendered;
						lastDayRendered = day;

						return (
							<React.Fragment key={result.id}>
								<div
									className={clsx(
										"text-xs font-semi-bold text-theme-secondary",
										{
											invisible: !isMounted || !shouldRenderDateHeader,
										},
									)}
								>
									{isMounted
										? formatDate(databaseTimestampToDate(result.createdAt), {
												weekday: "long",
												month: "long",
												day: "numeric",
											})
										: "t"}
								</div>
								{result.type === "GROUP_MATCH" ? (
									<GroupMatchResult match={result.groupMatch} />
								) : (
									<TournamentResult result={result.tournamentResult} />
								)}
							</React.Fragment>
						);
					})}
				</div>
				{results.pages > 1 ? (
					<Pagination
						currentPage={results.currentPage}
						pagesCount={results.pages}
						nextPage={() => setPage(results.currentPage + 1)}
						previousPage={() => setPage(results.currentPage - 1)}
						setPage={(page) => setPage(page)}
					/>
				) : null}
			</div>
		</div>
	);
}

function GroupMatchResult({ match }: { match: SeasonGroupMatch }) {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;
	const userId = layoutData.user.id;

	// score when match has not yet been played or was canceled
	const specialScoreMarking = () => {
		if (match.score[0] + match.score[1] === 0) return " ";

		return null;
	};

	const reserveWeaponSpace =
		match.groupAlphaMembers.some((m) => m.weaponSplId) ||
		match.groupBravoMembers.some((m) => m.weaponSplId);

	// make sure user's team is always on the top
	const rows = match.groupAlphaMembers.some((m) => m.id === userId)
		? [
				<MatchMembersRow
					key="alpha"
					members={match.groupAlphaMembers}
					score={specialScoreMarking() ?? match.score[0]}
					reserveWeaponSpace={reserveWeaponSpace}
				/>,
				<MatchMembersRow
					key="bravo"
					members={match.groupBravoMembers}
					score={specialScoreMarking() ?? match.score[1]}
					reserveWeaponSpace={reserveWeaponSpace}
				/>,
			]
		: [
				<MatchMembersRow
					key="bravo"
					members={match.groupBravoMembers}
					score={specialScoreMarking() ?? match.score[1]}
					reserveWeaponSpace={reserveWeaponSpace}
				/>,
				<MatchMembersRow
					key="alpha"
					members={match.groupAlphaMembers}
					score={specialScoreMarking() ?? match.score[0]}
					reserveWeaponSpace={reserveWeaponSpace}
				/>,
			];

	return (
		<div>
			<Link
				to={sendouQMatchPage(match.id)}
				className={clsx("u__season__match", {
					"u__season__match__with-sub-section ": match.spDiff,
				})}
			>
				{rows}
			</Link>
			{match.spDiff ? (
				<div className="u__season__match__sub-section">
					{match.spDiff > 0 ? (
						<span className="text-success">▲</span>
					) : (
						<span className="text-warning">▼</span>
					)}
					{Math.abs(roundToNDecimalPlaces(match.spDiff))}SP
				</div>
			) : null}
		</div>
	);
}

function TournamentResult({ result }: { result: SeasonTournamentResult }) {
	return (
		<div data-testid="seasons-tournament-result">
			<Link
				to={tournamentTeamPage(result)}
				className={clsx("u__season__match", {
					"u__season__match__with-sub-section ": result.spDiff,
				})}
			>
				<div className="stack font-bold items-center text-lg text-center">
					<img
						src={result.logoUrl}
						width={36}
						height={36}
						alt=""
						className="rounded-full"
					/>
					{result.tournamentName}
				</div>
				<ul className="u__season__match__set-results">
					{result.setResults.filter(Boolean).map((result, i) => (
						<li key={i} data-is-win={String(result === "W")}>
							{result}
						</li>
					))}
				</ul>
			</Link>
			{result.spDiff ? (
				<div className="u__season__match__sub-section">
					{result.spDiff > 0 ? (
						<span className="text-success">▲</span>
					) : (
						<span className="text-warning">▼</span>
					)}
					{Math.abs(roundToNDecimalPlaces(result.spDiff))}SP
				</div>
			) : null}
		</div>
	);
}

function MatchMembersRow({
	score,
	members,
	reserveWeaponSpace,
}: {
	score: React.ReactNode;
	members: SeasonGroupMatch["groupAlphaMembers"];
	reserveWeaponSpace: boolean;
}) {
	return (
		<div className="stack horizontal xs items-center">
			{members.map((member) => {
				return (
					<div key={member.discordId} className="u__season__match__user">
						<Avatar user={member} size="xxs" />
						<span className="u__season__match__user__name">
							{member.username}
						</span>
						{typeof member.weaponSplId === "number" ? (
							<WeaponImage
								weaponSplId={member.weaponSplId}
								variant="badge"
								size={28}
							/>
						) : reserveWeaponSpace ? (
							<WeaponImage
								weaponSplId={0}
								variant="badge"
								size={28}
								className="invisible"
							/>
						) : null}
					</div>
				);
			})}
			<div className="u__season__match__score">{score}</div>
		</div>
	);
}
