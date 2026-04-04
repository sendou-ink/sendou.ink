import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { Image, WeaponImage } from "~/components/Image";
import { ArrowRightIcon } from "~/components/icons/ArrowRight";
import { BSKYLikeIcon } from "~/components/icons/BSKYLike";
import { BSKYReplyIcon } from "~/components/icons/BSKYReply";
import { BSKYRepostIcon } from "~/components/icons/BSKYRepost";
import { ExternalIcon } from "~/components/icons/External";
import { navItems } from "~/components/layout/nav-items";
import { Main } from "~/components/Main";
import { TournamentCard } from "~/features/calendar/components/TournamentCard";
import { SplatoonRotations } from "~/features/front-page/components/SplatoonRotations";
import type * as Changelog from "~/features/front-page/core/Changelog.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { useHydrated } from "~/hooks/useHydrated";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import styles from "~/styles/front.module.css";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BLANK_IMAGE_URL,
	LUTI_PAGE,
	leaderboardsPage,
	navIconUrl,
	SENDOUQ_PAGE,
	sqHeaderGuyImageUrl,
} from "~/utils/urls";
import { type LeaderboardEntry, loader } from "../loaders/index.server";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["front", "game-misc"],
};

export default function FrontPage() {
	return (
		<Main className={styles.frontPageContainer}>
			<LeagueBanner />
			<SeasonBanner />
			<SplatoonRotations />
			<ResultHighlights />
			<DiscoverFeatures />
			<ChangelogList />
		</Main>
	);
}

function useSeasonData() {
	const season = Seasons.next() ?? Seasons.currentOrPrevious()!;
	const previousSeason = Seasons.previous();

	const isInFuture = new Date() < season.starts;
	const isShowingPreviousSeason = previousSeason?.nth === season.nth;

	return { season, isInFuture, isShowingPreviousSeason };
}

function SeasonDates({
	season,
	className,
}: {
	season: ReturnType<typeof useSeasonData>["season"];
	className: string;
}) {
	const isHydrated = useHydrated();
	const { formatDate } = useTimeFormat();

	return isHydrated ? (
		<div className={className}>
			{formatDate(season.starts, { month: "long", day: "numeric" })} -{" "}
			{formatDate(season.ends, { month: "long", day: "numeric" })}
		</div>
	) : (
		<div className={clsx(className, "invisible")}>X</div>
	);
}

function SeasonBanner() {
	const { t } = useTranslation(["front"]);
	const { season, isInFuture, isShowingPreviousSeason } = useSeasonData();

	if (isShowingPreviousSeason) return null;

	return (
		<div className={styles.seasonBannerMobileOnly}>
			<Link to={SENDOUQ_PAGE} className={styles.seasonBanner}>
				<div className={styles.seasonBannerHeader}>
					{t("front:sq.season", { nth: season.nth })}
				</div>
				<SeasonDates season={season} className={styles.seasonBannerDates} />
				<Image
					className={styles.seasonBannerImg}
					path={sqHeaderGuyImageUrl(season.nth)}
					alt=""
				/>
			</Link>
			<Link to={SENDOUQ_PAGE} className={styles.seasonBannerLink}>
				<div className="stack horizontal xs items-center">
					<Image path={navIconUrl("sendouq")} width={24} alt="" />
					{isInFuture ? t("front:sq.prepare") : t("front:sq.participate")}
					<ArrowRightIcon />
				</div>
			</Link>
		</div>
	);
}

function SeasonCard() {
	const { t } = useTranslation(["front"]);
	const { season, isInFuture, isShowingPreviousSeason } = useSeasonData();

	if (isShowingPreviousSeason) return null;

	return (
		<>
			<Link to={SENDOUQ_PAGE} className={styles.seasonCard}>
				<div className={styles.seasonCardHeader}>
					{t("front:sq.season", { nth: season.nth })}
				</div>
				<SeasonDates season={season} className={styles.seasonCardDates} />
				<Image
					className={styles.seasonCardImg}
					path={sqHeaderGuyImageUrl(season.nth)}
					alt=""
				/>
			</Link>
			<Link to={SENDOUQ_PAGE} className={styles.seasonCardButton}>
				<Image path={navIconUrl("sendouq")} size={16} alt="" />
				{isInFuture ? t("front:sq.prepare") : t("front:sq.participate")}
			</Link>
		</>
	);
}

function LeagueBanner() {
	const showBannerFor = import.meta.env.VITE_SHOW_BANNER_FOR_SEASON;
	if (!showBannerFor) return null;

	return (
		<Link to={LUTI_PAGE} className={styles.lutiBanner}>
			<Image path={navIconUrl("luti")} size={24} alt="" />
			Registration now open for Leagues Under The Ink (LUTI) Season{" "}
			{showBannerFor}!
		</Link>
	);
}

function ResultHighlights() {
	const { t } = useTranslation(["front", "common"]);
	const data = useLoaderData<typeof loader>();

	// should not happen
	if (
		!data.leaderboards.team.length ||
		!data.leaderboards.user.length ||
		!data.tournaments.results.length
	) {
		return null;
	}

	const season = Seasons.currentOrPrevious()!;

	return (
		<>
			<div
				className={clsx(
					styles.resultHighlights,
					styles.resultHighlightsTop,
					"overflow-x-auto scrollbar",
				)}
			>
				<div className={styles.seasonCardDesktopOnly}>
					<h2 className={styles.resultHighlightsTitle}>
						{t("common:pages.sendouq")}
					</h2>
					<SeasonCard />
				</div>
				<div className="stack sm text-center">
					<h2 className={styles.resultHighlightsTitle}>
						{t("front:leaderboards.topPlayers")}
					</h2>
					<Leaderboard
						entries={data.leaderboards.user}
						fullLeaderboardUrl={leaderboardsPage({
							season: season.nth,
							type: "USER",
						})}
					/>
				</div>
				<div className="stack sm text-center">
					<h2 className={styles.resultHighlightsTitle}>
						{t("front:leaderboards.topTeams")}
					</h2>
					<Leaderboard
						entries={data.leaderboards.team}
						fullLeaderboardUrl={leaderboardsPage({
							season: season.nth,
							type: "TEAM",
						})}
					/>
				</div>
			</div>
			<div className={clsx(styles.resultHighlights, "scrollbar")}>
				<div className="stack sm text-center">
					<h2
						className={clsx(
							styles.resultHighlightsTitle,
							styles.resultHighlightsTitleTournaments,
						)}
					>
						{t("front:showcase.results")}
					</h2>
					<div className={styles.tournamentCardsSpacer}>
						{data.tournaments.results.map((tournament) => (
							<TournamentCard
								key={tournament.id}
								tournament={tournament}
								withRelativeTime
							/>
						))}
					</div>
				</div>
			</div>
		</>
	);
}

function Leaderboard({
	entries,
	fullLeaderboardUrl,
}: {
	entries: LeaderboardEntry[];
	fullLeaderboardUrl: string;
}) {
	const { t } = useTranslation(["front"]);

	return (
		<div className="stack xs items-center">
			<div className={styles.leaderboard}>
				{entries.map((entry, index) => (
					<Link
						to={entry.url}
						key={entry.url}
						className="stack sm horizontal items-center text-main-forced"
					>
						<div className="mx-1">{index + 1}</div>
						<Avatar url={entry.avatarUrl ?? BLANK_IMAGE_URL} size="xs" />
						<div className="stack items-start">
							<div className={styles.leaderboardName}>{entry.name}</div>
							<div className="text-xs font-semi-bold text-lighter">
								{entry.power.toFixed(2)}
							</div>
						</div>
					</Link>
				))}
			</div>
			<Link to={fullLeaderboardUrl} className={styles.leaderboardViewAll}>
				<Image path={navIconUrl("leaderboards")} size={16} alt="" />
				{t("front:leaderboards.viewFull")}
			</Link>
		</div>
	);
}

const DISCOVER_EXCLUDED_ITEMS = new Set(["settings", "luti"]);

function DiscoverFeatures() {
	const { t } = useTranslation(["front", "common"]);
	const data = useLoaderData<typeof loader>();

	const filteredNavItems = navItems.filter(
		(item) => !DISCOVER_EXCLUDED_ITEMS.has(item.name),
	);

	return (
		<div className="stack md">
			<Divider smallText className="text-uppercase text-xs font-bold">
				{t("front:discover.header")}
			</Divider>
			{data.weaponPool && data.weaponPool.length > 0 ? (
				<div className={styles.weaponPills}>
					{data.weaponPool.map((weapon) => (
						<Link
							key={weapon.weaponSplId}
							to={`?search=open&type=weapons&weapon=${weapon.weaponSplId}`}
							className={styles.weaponPill}
						>
							<WeaponImage
								weaponSplId={weapon.weaponSplId}
								variant="badge"
								size={32}
							/>
						</Link>
					))}
				</div>
			) : null}
			<nav className={styles.discoverGrid}>
				{filteredNavItems.map((item) => (
					<Link
						key={item.name}
						to={`/${item.url}`}
						className={styles.discoverGridItem}
					>
						<div className={styles.discoverGridItemImage}>
							<Image
								path={navIconUrl(item.name)}
								height={32}
								width={32}
								alt=""
							/>
						</div>
						<span>{t(`common:pages.${item.name}` as any)}</span>
					</Link>
				))}
			</nav>
		</div>
	);
}

function ChangelogList() {
	const { t } = useTranslation(["front"]);
	const data = useLoaderData<typeof loader>();

	if (data.changelog.length === 0) return null;

	return (
		<div className="stack md">
			<Divider smallText className="text-uppercase text-xs font-bold">
				{t("front:updates.header")}
			</Divider>
			{data.changelog.map((item) => (
				<React.Fragment key={item.id}>
					<ChangelogItem item={item} />
					<br />
				</React.Fragment>
			))}
			<a
				href="https://bsky.app/hashtag/sendouink?author=sendou.ink"
				target="_blank"
				rel="noopener noreferrer"
				className="stack horizontal sm mx-auto text-xs font-bold"
			>
				{t("front:updates.viewPast")}{" "}
				<ExternalIcon className={styles.externalLinkIcon} />
			</a>
		</div>
	);
}

const ADMIN_PFP_URL =
	"https://cdn.discordapp.com/avatars/79237403620945920/6fc41a44b069a0d2152ac06d1e496c6c.webp?size=80";

function ChangelogItem({ item }: { item: Changelog.ChangelogItem }) {
	return (
		<div className="stack sm horizontal">
			<Avatar size="sm" url={ADMIN_PFP_URL} />
			<div className="whitespace-pre-wrap">
				<div className="font-bold">
					Sendou{" "}
					<span className="text-xs text-lighter">{item.createdAtRelative}</span>
				</div>
				{item.text}
				{item.images.length > 0 ? (
					<div className="mt-4 stack horizontal sm flex-wrap">
						{item.images.map((image) => (
							<img
								key={image.thumb}
								src={image.thumb}
								alt=""
								className={styles.changeLogImg}
							/>
						))}
					</div>
				) : null}
				<div className="mt-4 stack xxl horizontal">
					<BSKYIconLink count={item.stats.replies} postUrl={item.postUrl}>
						<BSKYReplyIcon />
					</BSKYIconLink>
					<BSKYIconLink count={item.stats.reposts} postUrl={item.postUrl}>
						<BSKYRepostIcon />
					</BSKYIconLink>
					<BSKYIconLink count={item.stats.likes} postUrl={item.postUrl}>
						<BSKYLikeIcon />
					</BSKYIconLink>
				</div>
			</div>
		</div>
	);
}

function BSKYIconLink({
	children,
	count,
	postUrl,
}: {
	children: React.ReactNode;
	count: number;
	postUrl: string;
}) {
	return (
		<a
			href={postUrl}
			target="_blank"
			rel="noopener noreferrer"
			className={styles.changeLogIconButton}
		>
			{children}
			<span
				className={clsx({
					invisible: count === 0,
				})}
			>
				{count}
			</span>
		</a>
	);
}
