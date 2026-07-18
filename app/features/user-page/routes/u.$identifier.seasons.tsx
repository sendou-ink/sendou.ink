import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	Outlet,
	type ShouldRevalidateFunction,
	useLoaderData,
	useLocation,
	useMatches,
	useNavigate,
	useSearchParams,
} from "react-router";
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
	SendouTabs,
} from "~/components/elements/Tabs";
import { TierImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { mainStyles } from "~/components/Main";
import { TopTenPlayer } from "~/features/leaderboards/components/TopTenPlayer";
import { playerTopTenPlacement } from "~/features/leaderboards/leaderboards-utils";
import * as Seasons from "~/features/mmr/core/Seasons";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import invariant from "~/utils/invariant";
import { isRevalidation } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	sendouQMatchPage,
	TIERS_PAGE,
	userPage,
	userSeasonsPage,
	userSeasonsStatsPage,
} from "~/utils/urls";
import { SubPageHeader } from "../components/SubPageHeader";
import {
	loader,
	type UserSeasonsPageLoaderData,
} from "../loaders/u.$identifier.seasons.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import styles from "../user-page.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["user"],
};

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	if (isRevalidation(args)) return args.defaultShouldRevalidate;
	if (args.formMethod === "POST") return args.defaultShouldRevalidate;
	if (args.currentParams.identifier !== args.nextParams.identifier) return true;

	return (
		args.currentUrl.searchParams.get("season") !==
		args.nextUrl.searchParams.get("season")
	);
};

const STAT_TABS = [
	{ info: "weapons", labelKey: "weapons" },
	{ info: "stages", labelKey: "stages" },
	{ info: "mates", labelKey: "teammates" },
	{ info: "enemies", labelKey: "opponents" },
] as const;

const DAYS_WITH_SKILL_NEEDED_TO_SHOW_POWER_CHART = 2;
export default function UserSeasonsLayout() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as UserPageLoaderData;

	if (!data) {
		return (
			<div>
				<SubPageHeader
					user={layoutData.user}
					backTo={userPage(layoutData.user)}
				/>
				<div className="text-lg text-lighter font-semi-bold text-center mt-2">
					{t("user:seasons.noSeasons")}
				</div>
			</div>
		);
	}

	return (
		<div className={clsx(mainStyles.narrow, "stack lg")}>
			<SubPageHeader
				user={layoutData.user}
				backTo={userPage(layoutData.user)}
			/>
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
			{data.canceled ? (
				<CanceledMatchesDialog canceledMatches={data.canceled} />
			) : null}
			<SeasonNav user={layoutData.user} season={data.season} />
			<Outlet />
		</div>
	);
}

function SeasonNav({
	user,
	season,
}: {
	user: UserPageLoaderData["user"];
	season: number;
}) {
	const { t } = useTranslation(["user"]);
	const location = useLocation();
	const [searchParams] = useSearchParams();

	const isStats = location.pathname.endsWith("/seasons/stats");
	const selectedKey = isStats
		? (searchParams.get("info") ?? "weapons")
		: "sets";

	const routerOptions = { preventScrollReset: true };

	return (
		<SendouTabs selectedKey={selectedKey}>
			<SendouTabList>
				<SendouTab
					id="sets"
					href={userSeasonsPage({ user, season })}
					routerOptions={routerOptions}
				>
					{t("user:seasons.tabs.sets")}
				</SendouTab>
				{STAT_TABS.map(({ info, labelKey }) => (
					<SendouTab
						key={info}
						id={info}
						href={userSeasonsStatsPage({ user, season, info })}
						routerOptions={routerOptions}
					>
						{t(`user:seasons.tabs.${labelKey}`)}
					</SendouTab>
				))}
			</SendouTabList>
		</SendouTabs>
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
	const { starts, ends } = Seasons.nthToDateRange(seasonViewed);
	const navigate = useNavigate();
	const options = useSeasonSelectOptions();

	return (
		<div>
			<SendouSelect
				label={t("user:seasons.season")}
				selectedKey={seasonViewed}
				onSelectionChange={(seasonNth) => navigate(`?season=${seasonNth}`)}
				items={options}
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
			<div className="text-sm text-lighter mt-2">
				<LocaleTimeRange
					from={new Date(starts)}
					to={new Date(ends)}
					options={{
						day: "numeric",
						month: "numeric",
						year: "numeric",
					}}
					inline
				/>
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
			<div className={styles.seasonWinrate}>
				<span className="text-theme text-xxs">Sets</span> {winrates.sets.wins}
				{t("user:seasons.win.short")} {winrates.sets.losses}
				{t("user:seasons.loss.short")} (
				{winrate(winrates.sets.wins, winrates.sets.losses)}%)
			</div>
			<div className={styles.seasonWinrate}>
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
	const layoutData = parentRoute.loaderData as UserPageLoaderData;

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
					<div className={styles.seasonTentative}>
						{t("user:seasons.tentative")}{" "}
						<SendouPopover
							popoverClassName={styles.seasonTentativeExplanation}
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

	return (
		<Chart
			xTicksLimit={5}
			yTicksLimit={5}
			options={chartOptions as any}
			xAxis="localTime"
		/>
	);
}

/** Dialog for staff view all season's canceled matches per user */
function CanceledMatchesDialog({
	canceledMatches,
}: {
	canceledMatches: NonNullable<UserSeasonsPageLoaderData["canceled"]>;
}) {
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
						<LocaleTime
							date={match.createdAt}
							options={{
								year: "numeric",
								month: "numeric",
								day: "numeric",
								hour: "numeric",
								minute: "numeric",
							}}
						/>
					</div>
				))}
			</div>
		</SendouDialog>
	);
}
