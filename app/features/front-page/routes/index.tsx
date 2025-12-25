import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Image } from "~/components/Image";
import { ArrowRightIcon } from "~/components/icons/ArrowRight";
import { BSKYLikeIcon } from "~/components/icons/BSKYLike";
import { BSKYReplyIcon } from "~/components/icons/BSKYReply";
import { BSKYRepostIcon } from "~/components/icons/BSKYRepost";
import { ExternalIcon } from "~/components/icons/External";
import { KeyIcon } from "~/components/icons/Key";
import { LogOutIcon } from "~/components/icons/LogOut";
import { SearchIcon } from "~/components/icons/Search";
import { UsersIcon } from "~/components/icons/Users";
import { navItems } from "~/components/layout/nav-items";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import type { ShowcaseCalendarEvent } from "~/features/calendar/calendar-types";
import { TournamentCard } from "~/features/calendar/components/TournamentCard";
import type * as Changelog from "~/features/front-page/core/Changelog.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import styles from "~/styles/front.module.css";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BLANK_IMAGE_URL,
	CALENDAR_TOURNAMENTS_PAGE,
	LOG_OUT_URL,
	LUTI_PAGE,
	leaderboardsPage,
	navIconUrl,
	SENDOUQ_PAGE,
	sqHeaderGuyImageUrl,
} from "~/utils/urls";

import { type LeaderboardEntry, loader } from "../loaders/index.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["front"],
};

export default function FrontPage() {
	return (
		<Main className={styles.frontPageContainer}>
			<LeagueBanner />
			<DesktopSideNav />
			<SeasonBanner />
			<TournamentCards />
			<ResultHighlights />
			<ChangelogList />
		</Main>
	);
}

function DesktopSideNav() {
	const user = useUser();
	const { t } = useTranslation(["common"]);

	return (
		<nav className={clsx(styles.frontPageSideNav, "scrollbar")}>
			{navItems.map((item) => {
				return (
					<Link
						to={`/${item.url}`}
						key={item.name}
						prefetch={item.prefetch ? "render" : undefined}
						className={styles.frontPageSideNavItem}
					>
						<Image
							path={navIconUrl(item.name)}
							height={20}
							width={20}
							alt={item.name}
						/>
						{<div>{t(`common:pages.${item.name}` as any)}</div>}
					</Link>
				);
			})}
			{user ? (
				<form method="post" action={LOG_OUT_URL}>
					<SendouButton
						size="small"
						variant="minimal"
						icon={<LogOutIcon />}
						type="submit"
						className={styles.frontPageSideNavLogOut}
					>
						{t("common:header.logout")}
					</SendouButton>
				</form>
			) : null}
		</nav>
	);
}

function SeasonBanner() {
	const { t } = useTranslation(["front"]);
	const season = Seasons.next(new Date()) ?? Seasons.currentOrPrevious()!;
	const _previousSeason = Seasons.previous();
	const isMounted = useIsMounted();
	const { formatDate } = useTimeFormat();

	const isInFuture = new Date() < season.starts;
	const isShowingPreviousSeason = _previousSeason?.nth === season.nth;

	if (isShowingPreviousSeason) return null;

	return (
		<div className="stack xs">
			<Link to={SENDOUQ_PAGE} className={styles.seasonBanner}>
				<div className={styles.seasonBannerHeader}>
					{t("front:sq.season", { nth: season.nth })}
				</div>
				{isMounted ? (
					<div className={styles.seasonBannerDates}>
						{formatDate(season.starts, {
							month: "long",
							day: "numeric",
						})}{" "}
						-{" "}
						{formatDate(season.ends, {
							month: "long",
							day: "numeric",
						})}
					</div>
				) : (
					<div className={clsx(styles.seasonBannerDates, "invisible")}>X</div>
				)}
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

function TournamentCards() {
	const { t } = useTranslation(["front"]);
	const data = useLoaderData<typeof loader>();

	if (
		data.tournaments.participatingFor.length === 0 &&
		data.tournaments.organizingFor.length === 0 &&
		data.tournaments.showcase.length === 0
	) {
		return null;
	}

	const showSignedUpTab = data.tournaments.participatingFor.length > 0;
	const showOrganizerTab = data.tournaments.organizingFor.length > 0;
	const showDiscoverTab = data.tournaments.showcase.length > 0;

	return (
		<div>
			<SendouTabs padded={false}>
				<SendouTabList>
					{showSignedUpTab ? (
						<SendouTab id="signed-up" icon={<UsersIcon />}>
							{t("front:showcase.tabs.signedUp")}
						</SendouTab>
					) : null}
					{showOrganizerTab ? (
						<SendouTab id="organizer" icon={<KeyIcon />}>
							{t("front:showcase.tabs.organizer")}
						</SendouTab>
					) : null}
					{showDiscoverTab ? (
						<SendouTab id="discover" icon={<SearchIcon />}>
							{t("front:showcase.tabs.discover")}
						</SendouTab>
					) : null}
				</SendouTabList>
				<SendouTabPanel id="signed-up">
					<ShowcaseTournamentScroller
						tournaments={data.tournaments.participatingFor}
					/>
				</SendouTabPanel>
				<SendouTabPanel id="organizer">
					<ShowcaseTournamentScroller
						tournaments={data.tournaments.organizingFor}
					/>
				</SendouTabPanel>
				<SendouTabPanel id="discover">
					<ShowcaseTournamentScroller tournaments={data.tournaments.showcase} />
				</SendouTabPanel>
			</SendouTabs>
		</div>
	);
}

function ShowcaseTournamentScroller({
	tournaments,
}: {
	tournaments: ShowcaseCalendarEvent[];
}) {
	return (
		<div className={styles.tournamentCards}>
			<div
				className={clsx(
					styles.tournamentCardsSpacer,
					"overflow-x-auto scrollbar",
				)}
			>
				{tournaments.map((tournament) => (
					<TournamentCard
						key={tournament.id}
						tournament={tournament}
						className="mt-4"
					/>
				))}
			</div>
			<AllTournamentsLinkCard />
		</div>
	);
}

function AllTournamentsLinkCard() {
	const { t } = useTranslation(["front"]);

	return (
		<Link
			to={CALENDAR_TOURNAMENTS_PAGE}
			className={clsx(styles.tournamentCardsViewAllCard, "mt-4")}
		>
			<Image path={navIconUrl("medal")} size={36} alt="" />
			{t("front:showcase.viewAll")}
		</Link>
	);
}

function ResultHighlights() {
	const { t } = useTranslation(["front"]);
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

	const recentResults = (
		<>
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
		</>
	);

	return (
		<>
			<div
				className={clsx(styles.resultHighlights, "overflow-x-auto scrollbar")}
			>
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
				<div className="stack sm text-center mobile-hidden">
					{recentResults}
				</div>
			</div>
			<div
				className={clsx(styles.resultHighlights, "overflow-x-auto scrollbar")}
			>
				<div className="stack sm text-center desktop-hidden">
					{recentResults}
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
