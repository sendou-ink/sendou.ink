import clsx from "clsx";
import { format } from "date-fns";
import {
	CalendarDays,
	ChartColumn,
	ChevronRight,
	Gauge,
	HardDriveDownload,
	Users,
} from "lucide-react";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useFetcher, useLoaderData, useMatches } from "react-router";
import { Avatar } from "~/components/Avatar";
import { EmptyState } from "~/components/EmptyState";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouPopover } from "~/components/elements/Popover";
import {
	Image,
	ModeImage,
	StageImage,
	TierImage,
	WeaponImage,
} from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { Pagination } from "~/components/Pagination";
import { Placement } from "~/components/Placement";
import { SpDelta } from "~/components/SpDelta";
import { useUser } from "~/features/auth/core/user";
import { ImageExportDialog } from "~/features/img-export/components/ImageExportDialog";
import { SeasonSummaryGraphic } from "~/features/img-export/components/SeasonSummaryGraphic";
import * as SeasonSummary from "~/features/img-export/core/SeasonSummary";
import { TopTenPlayer } from "~/features/leaderboards/components/TopTenPlayer";
import { leaderboardsPage } from "~/features/leaderboards/leaderboards-urls";
import { playerTopTenPlacement } from "~/features/leaderboards/leaderboards-utils";
import { SeasonActivityCalendar } from "~/features/mmr/components/SeasonActivityCalendar";
import * as Seasons from "~/features/mmr/core/Seasons";
import type {
	SeasonGroupMatch,
	SeasonTournamentResult,
} from "~/features/sendouq-match/SQMatchRepository.server";
import {
	userSeasonSummaryGraphicPage,
	userSeasonsPage,
	userSeasonsStatsPage,
} from "~/features/user-page/user-page-urls";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { useSearchParam } from "~/modules/search-params/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	resolveAvatarUrl,
	sendouQMatchPage,
	tierImageUrl,
	tournamentTeamPage,
	userPage,
} from "~/utils/urls";
import { SubPageHeader } from "../components/SubPageHeader";
import {
	loader,
	type UserSeasonsPageLoaderData,
} from "../loaders/u.$identifier.seasons.server";
import type { UserSeasonSummaryGraphicLoaderData } from "../loaders/u.$identifier.seasons.summary-graphic.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import {
	SEASON_RESULT_SOURCES,
	type SeasonResultSource,
} from "../user-page-constants";
import { userSeasonsSearchParams } from "../user-page-search-params";
import styles from "./u.$identifier.seasons.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["user", "calendar"],
};

export const shouldRevalidate = userSeasonsSearchParams.shouldRevalidate;

export default function UserSeasonsPage() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const layoutData = useUserPageLayoutData();

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
			<SubPageHeader user={layoutData.user} backTo={userPage(layoutData.user)}>
				<SeasonSummaryExport
					profileUser={layoutData.user}
					season={data.season}
					seasonsParticipatedIn={data.seasonsParticipatedIn}
					hasCalculatedSkill={data.hasCalculatedSkill}
				/>
			</SubPageHeader>
			<SeasonHeading season={data.season} userId={layoutData.user.id} />
			<SeasonPicker
				user={layoutData.user}
				seasonViewed={data.season}
				seasonOverviews={data.seasonOverviews}
			/>
			<div
				className={styles.overview}
				data-has-team={String(Boolean(data.teamEntry))}
			>
				{data.teamEntry ? (
					<TeamRank season={data.season} teamEntry={data.teamEntry} />
				) : null}
				<section className={clsx(styles.overviewCard, styles.activity)}>
					<h2 className={styles.overviewCardHeading}>
						<CalendarDays size={14} />
						{t("user:seasons.summary.activity")}
					</h2>
					<SeasonActivityCalendar
						seasonDateRange={Seasons.nthToDateRange(data.season)}
						activeDays={data.activeDays}
						today={new Date()}
						monthNames="short"
						className={clsx(styles.activityCalendar, "scrollbar")}
					/>
				</section>
				<StatsPeek
					user={layoutData.user}
					season={data.season}
					peek={data.statsPeek}
				/>
			</div>
			<SeasonHistory />
			{data.canceled ? (
				<CanceledMatchesDialog canceledMatches={data.canceled} />
			) : null}
		</div>
	);
}

function useUserPageLayoutData() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	return parentRoute.loaderData as UserPageLoaderData;
}

function useSeasonsLoaderData() {
	const data = useLoaderData<typeof loader>();
	invariant(data);
	return data;
}

function SeasonHeading({ season, userId }: { season: number; userId: number }) {
	const { t } = useTranslation(["user"]);
	const formatDistanceToNow = useFormatDistanceToNow();
	const { starts, ends } = Seasons.nthToDateRange(season);
	const isCurrent = Seasons.current()?.nth === season;
	const topTenPlacement = playerTopTenPlacement({ season, userId });

	return (
		<div className="stack horizontal md items-center justify-between flex-wrap">
			<div className="stack xs">
				<h1 className={styles.heading}>
					{t("user:seasons.season")} {season}
				</h1>
				<div className="text-sm text-lighter">
					<LocaleTimeRange
						from={new Date(starts)}
						to={new Date(ends)}
						options={{
							day: "numeric",
							month: "short",
							year: "numeric",
						}}
						inline
					/>
					{isCurrent
						? ` · ${t("user:seasons.ends", {
								time: formatDistanceToNow(new Date(ends), { addSuffix: true }),
							})}`
						: null}
				</div>
			</div>
			{topTenPlacement ? (
				<TopTenPlayer small placement={topTenPlacement} season={season} />
			) : null}
		</div>
	);
}

function SeasonPicker({
	user,
	seasonViewed,
	seasonOverviews,
}: {
	user: UserPageLoaderData["user"];
	seasonViewed: number;
	seasonOverviews: UserSeasonsPageLoaderData["seasonOverviews"];
}) {
	const { t } = useTranslation(["user"]);

	return (
		<nav
			className={clsx(styles.seasonPicker, "scrollbar")}
			aria-label={t("user:seasons.season")}
		>
			{seasonPickerItems(seasonOverviews).map((item) => {
				if (item.type === "CUTOFF") {
					return <SeasonCutoff key={item.key} />;
				}

				const { overview } = item;

				return (
					<Link
						key={overview.season}
						to={userSeasonsPage({ user, season: overview.season })}
						className={styles.seasonPickerItem}
						aria-current={overview.season === seasonViewed ? "page" : undefined}
						preventScrollReset
					>
						<span className="stack horizontal sm justify-between items-center">
							<span className="text-md font-bold">
								{t("user:seasons.season.short")}
								{overview.season}
							</span>
							{typeof overview.sp === "number" ? (
								<span className="text-xs text-lighter font-semi-bold">
									{overview.sp}SP
								</span>
							) : null}
						</span>
						{overview.tier ? (
							<span className="stack horizontal xs items-center text-xs text-lighter font-semi-bold">
								<TierImage tier={overview.tier} width={20} />
								{overview.tier.name}
								{overview.tier.isPlus ? "+" : ""}
							</span>
						) : (
							<span className="stack horizontal xs items-center text-xs text-lighter font-semi-bold text-uppercase">
								<Image
									path={tierImageUrl("CALCULATING")}
									alt=""
									width={20}
									height={20 * 0.8675}
								/>
								{t("user:seasons.unranked")}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
}

type SeasonOverview = UserSeasonsPageLoaderData["seasonOverviews"][number];

/** Played seasons newest first, with a cutoff marking each run of seasons not played in between */
function seasonPickerItems(seasonOverviews: SeasonOverview[]) {
	const items: Array<
		| { type: "SEASON"; overview: SeasonOverview }
		| { type: "CUTOFF"; key: string }
	> = [];

	for (const overview of seasonOverviews.toSorted(
		(a, b) => b.season - a.season,
	)) {
		const previous = items.at(-1);
		if (
			previous?.type === "SEASON" &&
			previous.overview.season - overview.season > 1
		) {
			items.push({ type: "CUTOFF", key: `cutoff-${overview.season}` });
		}

		items.push({ type: "SEASON", overview });
	}

	return items;
}

function SeasonCutoff() {
	return (
		<svg
			className={styles.seasonCutoff}
			viewBox="0 0 12 64"
			preserveAspectRatio="none"
			aria-hidden
		>
			<path
				d="M6 0 Q 11 4 6 8 T 6 16 T 6 24 T 6 32 T 6 40 T 6 48 T 6 56 T 6 64"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function TeamRank({
	season,
	teamEntry,
}: {
	season: number;
	teamEntry: NonNullable<UserSeasonsPageLoaderData["teamEntry"]>;
}) {
	const { t } = useTranslation(["user"]);

	return (
		<section className={clsx(styles.overviewCard, styles.teamRank)}>
			<h2 className={styles.overviewCardHeading}>
				<Users size={14} />
				{t("user:seasons.summary.teamRank")}
			</h2>
			<div className={styles.teamRankSummary}>
				{teamEntry.placement ? (
					<Link
						to={leaderboardsPage({ season, type: "TEAM-ALL" })}
						className={styles.teamRankPlacement}
					>
						#{teamEntry.placement}
					</Link>
				) : (
					<span className={styles.teamRankPlacement}>–</span>
				)}
				<div className={styles.teamRankDetails}>
					<span className="text-lighter">{Math.round(teamEntry.sp)}SP</span>
					{teamEntry.team ? (
						<span className={styles.teamRankTeam}>
							{teamEntry.team.avatarUrl ? (
								<img
									src={teamEntry.team.avatarUrl}
									width={16}
									height={16}
									alt=""
									className="rounded-full"
								/>
							) : null}
							<span className={styles.statsPeekValue}>
								{teamEntry.team.name}
							</span>
						</span>
					) : null}
				</div>
			</div>
			<ul className={styles.teamRankMembers}>
				{teamEntry.members.map((member) => (
					<li key={member.id}>
						<Link to={userPage(member)} className={styles.teamRankMember}>
							<Avatar user={member} size="xxs" />
							<span className={styles.statsPeekValue}>{member.username}</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}

function StatsPeek({
	user,
	season,
	peek,
}: {
	user: UserPageLoaderData["user"];
	season: number;
	peek: UserSeasonsPageLoaderData["statsPeek"];
}) {
	const { t } = useTranslation(["user", "game-misc", "weapons"]);

	return (
		<section className={clsx(styles.overviewCard, styles.statsPeek)}>
			<h2 className={styles.overviewCardHeading}>
				<ChartColumn size={14} />
				{t("user:seasons.stats.title", { season })}
			</h2>
			<dl className={styles.statsPeekList}>
				{peek.bestStage ? (
					<StatsPeekItem label={t("user:seasons.summary.bestStage")}>
						<StageImage
							stageId={peek.bestStage.stageId}
							width={40}
							className="rounded"
						/>
						<span className={styles.statsPeekValue}>
							{t(`game-misc:STAGE_${peek.bestStage.stageId}`)}
						</span>
						<span className="text-lighter">
							{Math.round(peek.bestStage.winratePercentage)}%
						</span>
					</StatsPeekItem>
				) : null}
				{peek.topWeapon ? (
					<StatsPeekItem label={t("user:seasons.stats.mostPlayedWeapon")}>
						<WeaponImage
							weaponSplId={peek.topWeapon.weaponSplId}
							variant="build"
							size={24}
						/>
						<span className={styles.statsPeekValue}>
							{t(`weapons:MAIN_${peek.topWeapon.weaponSplId}`)}
						</span>
						<span className="text-lighter">
							{Math.round(peek.topWeapon.usagePercentage)}%
						</span>
					</StatsPeekItem>
				) : peek.topMode ? (
					<StatsPeekItem label={t("user:seasons.stats.mostPlayedMode")}>
						<ModeImage mode={peek.topMode.mode} size={24} />
						<span className={styles.statsPeekValue}>
							{t(`game-misc:MODE_LONG_${peek.topMode.mode}`)}
						</span>
						<span className="text-lighter">
							{Math.round(peek.topMode.usagePercentage)}%
						</span>
					</StatsPeekItem>
				) : null}
				{peek.topMate ? (
					<StatsPeekItem label={t("user:seasons.stats.topTeammate")}>
						<Avatar user={peek.topMate.user} size="xxs" />
						<span className={styles.statsPeekValue}>
							{peek.topMate.user.username}
						</span>
						<span className="text-lighter">
							{t("user:seasons.summary.count.sets", {
								count: peek.topMate.setsCount,
							})}
						</span>
					</StatsPeekItem>
				) : null}
			</dl>
			<Link
				to={userSeasonsStatsPage({ user, season })}
				className={styles.statsPeekLink}
			>
				{t("user:seasons.stats.seeAll")}
				<ChevronRight size={16} />
			</Link>
		</section>
	);
}

function StatsPeekItem({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.statsPeekItem}>
			<dt className="text-xs text-lighter">{label}</dt>
			<dd>{children}</dd>
		</div>
	);
}

function SeasonHistory() {
	const { t } = useTranslation(["user"]);
	const data = useSeasonsLoaderData();
	const [source, setSource] = useSearchParam(userSeasonsSearchParams, "source");

	return (
		<section className="stack md">
			<div className="stack horizontal md items-center justify-between flex-wrap">
				<h2 className={styles.subHeading}>{t("user:seasons.history")}</h2>
				<SendouChipRadioGroup>
					{SEASON_RESULT_SOURCES.map((value) => (
						<SendouChipRadio
							key={value}
							name="source"
							value={value}
							checked={source === value}
							onChange={(newValue) => setSource(newValue as SeasonResultSource)}
						>
							{t(`user:seasons.source.${value}`)}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
			</div>
			{data.results.value.length === 0 ? (
				<EmptyState navItem="sendouq">{t("user:seasons.noQ")}</EmptyState>
			) : (
				<Results results={data.results} />
			)}
		</section>
	);
}

type SeasonResult = UserSeasonsPageLoaderData["results"]["value"][number];

function Results({
	results,
}: {
	results: UserSeasonsPageLoaderData["results"];
}) {
	const ref = React.useRef<HTMLDivElement>(null);
	const layoutData = useUserPageLayoutData();

	const pagination = useSearchParamPagination({
		definition: userSeasonsSearchParams,
		currentPage: results.currentPage,
		pagesCount: results.pagesCount,
	});

	React.useEffect(() => {
		if (results.currentPage === 1) return;
		ref.current?.scrollIntoView({
			block: "center",
		});
	}, [results.currentPage]);

	return (
		<div className="stack lg">
			<div ref={ref} />
			<div className={styles.days}>
				{groupByDay(results.value).map((day) => (
					<div key={day.key} className="stack sm">
						<DayHeader results={day.results} userId={layoutData.user.id} />
						{day.results.map((result) =>
							result.type === "GROUP_MATCH" ? (
								<GroupMatchResult
									key={result.id}
									match={result.groupMatch}
									createdAt={result.createdAt}
									userId={layoutData.user.id}
								/>
							) : (
								<TournamentResult
									key={result.id}
									result={result.tournamentResult}
								/>
							),
						)}
					</div>
				))}
			</div>
			{results.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</div>
	);
}

function groupByDay(results: SeasonResult[]) {
	const days = new Map<string, SeasonResult[]>();

	for (const result of results) {
		const key = format(databaseTimestampToDate(result.createdAt), "yyyy-MM-dd");
		days.set(key, [...(days.get(key) ?? []), result]);
	}

	return Array.from(days, ([key, dayResults]) => ({
		key,
		results: dayResults,
	}));
}

function DayHeader({
	results,
	userId,
}: {
	results: SeasonResult[];
	userId: number;
}) {
	const { t } = useTranslation(["user"]);

	const groupMatches = results.flatMap((result) =>
		result.type === "GROUP_MATCH" ? [result.groupMatch] : [],
	);
	const wins = groupMatches.filter(
		(match) => groupMatchOutcome(match, userId) === "W",
	).length;
	const losses = groupMatches.filter(
		(match) => groupMatchOutcome(match, userId) === "L",
	).length;

	const spDiffs = results.flatMap((result) => {
		const spDiff =
			result.type === "GROUP_MATCH"
				? result.groupMatch.spDiff
				: result.tournamentResult.spDiff;
		return typeof spDiff === "number" ? [spDiff] : [];
	});
	const spTotal = spDiffs.reduce((acc, cur) => acc + cur, 0);

	return (
		<div className={styles.dayHeader}>
			<LocaleTime
				date={results[0].createdAt}
				options={{
					weekday: "long",
					month: "short",
					day: "numeric",
				}}
				className="text-sm font-semi-bold"
			/>
			<span className="stack horizontal xs items-center text-xs text-lighter">
				{groupMatches.length > 0 ? (
					<span>
						{t("user:seasons.summary.count.sets", {
							count: groupMatches.length,
						})}{" "}
						· {wins}–{losses}
					</span>
				) : null}
				{spDiffs.length > 0 ? (
					<>
						{groupMatches.length > 0 ? <span>·</span> : null}
						<SpDelta diff={spTotal} />
					</>
				) : null}
			</span>
			<span className={styles.dayHeaderLine} />
		</div>
	);
}

function groupMatchOutcome(match: SeasonGroupMatch, userId: number) {
	const isAlpha = match.groupAlphaMembers.some((m) => m.id === userId);
	const [alphaScore, bravoScore] = match.score;
	if (alphaScore === bravoScore) return null;

	return alphaScore > bravoScore === isAlpha ? "W" : "L";
}

function GroupMatchResult({
	match,
	createdAt,
	userId,
}: {
	match: SeasonGroupMatch;
	createdAt: number;
	userId: number;
}) {
	const { t } = useTranslation(["user"]);

	const isAlpha = match.groupAlphaMembers.some((m) => m.id === userId);
	const [ownScore, opponentScore] = isAlpha
		? match.score
		: [match.score[1], match.score[0]];
	const [ownTier, opponentTier] = isAlpha
		? [match.alphaTier, match.bravoTier]
		: [match.bravoTier, match.alphaTier];
	const outcome = groupMatchOutcome(match, userId);

	const showWeapons = [
		...match.groupAlphaMembers,
		...match.groupBravoMembers,
	].every((m) => typeof m.weaponSplId === "number");

	return (
		<Link to={sendouQMatchPage(match.id)} className={styles.result}>
			<div className={styles.outcome} data-outcome={outcome ?? undefined}>
				{outcome
					? t(
							outcome === "W"
								? "user:seasons.win.short"
								: "user:seasons.loss.short",
						)
					: "–"}
			</div>
			<div className={clsx(styles.resultInfo, "stack xs")}>
				<span className="text-sm font-semi-bold">
					SendouQ · {ownScore}–{opponentScore} ·{" "}
					<LocaleTime
						date={createdAt}
						options={{ hour: "numeric", minute: "numeric" }}
						inline
					/>
				</span>
				{ownTier && opponentTier ? (
					<span className="stack horizontal xs items-center text-xs text-lighter">
						<GroupTier tier={ownTier} />
						{t("user:seasons.vs")}
						<GroupTier tier={opponentTier} />
					</span>
				) : null}
			</div>
			<div className={styles.players}>
				<MatchMembers
					members={isAlpha ? match.groupAlphaMembers : match.groupBravoMembers}
					showWeapons={showWeapons}
				/>
				<span className="text-xs text-lighter">{t("user:seasons.vs")}</span>
				<MatchMembers
					members={isAlpha ? match.groupBravoMembers : match.groupAlphaMembers}
					showWeapons={showWeapons}
				/>
			</div>
			<div className={styles.sp}>
				{typeof match.spDiff === "number" ? (
					<SpDelta diff={match.spDiff} />
				) : null}
			</div>
		</Link>
	);
}

function GroupTier({
	tier,
}: {
	tier: NonNullable<SeasonGroupMatch["alphaTier"]>;
}) {
	return (
		<span className={styles.tierPill}>
			<TierImage tier={tier} width={20} />
			{tier.name}
			{tier.isPlus ? "+" : ""}
		</span>
	);
}

function MatchMembers({
	members,
	showWeapons,
}: {
	members: Array<
		SeasonTournamentResult["teamMembers"][number] &
			Partial<
				Pick<SeasonGroupMatch["groupAlphaMembers"][number], "weaponSplId">
			>
	>;
	showWeapons: boolean;
}) {
	return (
		<div className="stack horizontal xs">
			{members.map((member) => (
				<div key={member.discordId} className="stack xxs items-center">
					<Avatar
						user={member}
						size={showWeapons ? "xxs" : "xxsm"}
						alt={member.username}
					/>
					{showWeapons && typeof member.weaponSplId === "number" ? (
						<WeaponImage
							weaponSplId={member.weaponSplId}
							variant="badge"
							size={24}
						/>
					) : null}
				</div>
			))}
		</div>
	);
}

function TournamentResult({ result }: { result: SeasonTournamentResult }) {
	const { t } = useTranslation(["user"]);

	const setWins = result.setResults.filter((r) => r === "W").length;
	const setLosses = result.setResults.filter((r) => r === "L").length;

	return (
		<Link
			to={tournamentTeamPage(result)}
			className={styles.result}
			data-testid="seasons-tournament-result"
		>
			<div className={styles.outcome} data-outcome="tournament">
				<Placement placement={result.placement} size={28} />
			</div>
			<div className={clsx(styles.resultInfo, "stack xs")}>
				<span className="stack horizontal sm items-center text-sm font-semi-bold">
					<img
						src={result.logoUrl}
						width={24}
						height={24}
						alt=""
						className="rounded-full"
					/>
					{result.tournamentName}
				</span>
				<span className="text-xs text-lighter">
					<Trans
						t={t}
						i18nKey="user:seasons.placementOfTeams"
						values={{ count: result.participantCount }}
						components={[
							<Placement
								key="placement"
								placement={result.placement}
								textOnly
								showAsSuperscript={false}
							/>,
						]}
					/>{" "}
					· {setWins}–{setLosses}
				</span>
			</div>
			<div className={styles.players}>
				<MatchMembers members={result.teamMembers} showWeapons={false} />
			</div>
			<div className={clsx(styles.sp, "stack xxs items-end")}>
				{result.spDiff ? (
					<span className="stack horizontal xxs items-center">
						<SpDelta diff={result.spDiff} />
					</span>
				) : null}
				{result.teamSp !== null ? (
					<span className="stack horizontal xxs items-center text-xs text-lighter">
						<Users size={14} />
						{result.teamSpDiff !== null ? (
							<SpDelta diff={result.teamSpDiff} />
						) : (
							<>
								<Gauge size={14} />
								{roundToNDecimalPlaces(result.teamSp)}SP
							</>
						)}
					</span>
				) : null}
			</div>
		</Link>
	);
}

function SeasonSummaryExport({
	profileUser,
	season,
	seasonsParticipatedIn,
	hasCalculatedSkill,
}: {
	profileUser: UserPageLoaderData["user"];
	season: number;
	seasonsParticipatedIn: number[];
	hasCalculatedSkill: boolean;
}) {
	const { t } = useTranslation(["user"]);
	const loggedInUser = useUser();

	if (
		!loggedInUser ||
		loggedInUser.id !== profileUser.id ||
		!hasCalculatedSkill ||
		!SeasonSummary.isSeasonFinished(season)
	) {
		return null;
	}

	const canExport = SeasonSummary.canExportSeasonSummary({
		loggedInUser,
		profileUserId: profileUser.id,
		season,
		seasonsParticipatedIn,
		hasCalculatedSkill,
	});

	if (!canExport) {
		return (
			<SendouPopover
				trigger={
					<SendouButton
						size="small"
						variant="outlined"
						icon={<HardDriveDownload />}
					>
						{t("user:seasons.summary.export")}
					</SendouButton>
				}
			>
				{t("user:seasons.summary.export.supporterPerk")}
			</SendouPopover>
		);
	}

	return (
		<SeasonSummaryExportDialog
			key={season}
			profileUser={profileUser}
			season={season}
		/>
	);
}

function SeasonSummaryExportDialog({
	profileUser,
	season,
}: {
	profileUser: UserPageLoaderData["user"];
	season: number;
}) {
	const { t } = useTranslation(["user"]);
	const fetcher = useFetcher<UserSeasonSummaryGraphicLoaderData>();

	const handleOpen = () => {
		if (fetcher.state === "idle" && !fetcher.data) {
			fetcher.load(userSeasonSummaryGraphicPage({ user: profileUser, season }));
		}
	};

	const data = fetcher.data;

	return (
		<ImageExportDialog
			trigger={
				<SendouButton
					size="small"
					variant="outlined"
					icon={<HardDriveDownload />}
					onClick={handleOpen}
				>
					{t("user:seasons.summary.export")}
				</SendouButton>
			}
			heading={t("user:seasons.summary.export")}
			filename={`season-${season}-summary`}
			qrCodePath={userSeasonsPage({ user: profileUser, season })}
		>
			{data ? (
				<SeasonSummaryGraphic
					user={{
						name: profileUser.username,
						discordId: profileUser.discordId,
						customUrl: profileUser.customUrl ?? undefined,
						countryCode: profileUser.country ?? undefined,
						avatarUrl: resolveAvatarUrl({
							customAvatarUrl: profileUser.customAvatarUrl,
							discordId: profileUser.discordId,
							discordAvatar: profileUser.discordAvatar,
							size: "lg",
						}),
					}}
					season={data.season}
					seasonDateRange={Seasons.nthToDateRange(data.season)}
					stats={data}
				/>
			) : null}
		</ImageExportDialog>
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
					className="mx-auto"
				>
					Canceled Matches ({canceledMatches.length})
				</SendouButton>
			}
			heading="Season's canceled matches for this user"
		>
			<div className="stack lg">
				{canceledMatches.map((match) => (
					<div key={match.id} className="stack sm">
						<div>
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
						<CanceledMatchReports cancelReports={match.cancelReports} />
					</div>
				))}
			</div>
		</SendouDialog>
	);
}

function CanceledMatchReports({
	cancelReports,
}: {
	cancelReports: NonNullable<
		UserSeasonsPageLoaderData["canceled"]
	>[number]["cancelReports"];
}) {
	if (cancelReports.length === 0) {
		return (
			<div className="text-lighter text-xs">
				No cancel reports (canceled by staff)
			</div>
		);
	}

	const nominatedIdSets = cancelReports.map(
		(report) => new Set(report.nominatedPlayers.map((player) => player.id)),
	);
	const teamsAgree =
		nominatedIdSets.length === 2 &&
		nominatedIdSets[0].size === nominatedIdSets[1].size &&
		[...nominatedIdSets[0]].every((id) => nominatedIdSets[1].has(id));

	return (
		<div className="stack xs">
			{cancelReports.map((report, index) => (
				<div key={report.authorUsername} className="text-xs">
					<div className="text-lighter">
						{index === 0 ? "Requested" : "Accepted"} by {report.authorUsername}
					</div>
					<div>{report.reason}</div>
					<div className="text-lighter">
						Nominated:{" "}
						{report.nominatedPlayers
							.map((player) => player.username)
							.join(", ")}
					</div>
				</div>
			))}
			{cancelReports.length === 2 ? (
				<div className="text-xs font-semi-bold">
					{teamsAgree
						? "Teams nominated the same players"
						: "Teams nominated different players (split)"}
				</div>
			) : null}
		</div>
	);
}
