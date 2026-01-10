import clsx from "clsx";
import * as React from "react";
import { Button } from "react-aria-components";
import { Flipped, Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useMatches } from "react-router";
import { useUser } from "~/features/auth/core/user";
import type { RootLoaderData } from "~/root";
import type { Breadcrumb, SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, SETTINGS_PAGE, userPage } from "~/utils/urls";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { Image } from "../Image";
import { BellIcon } from "../icons/Bell";
import { CalendarIcon } from "../icons/Calendar";
import { GearIcon } from "../icons/Gear";
import { HamburgerIcon } from "../icons/Hamburger";
import { LogInIcon } from "../icons/LogIn";
import { TwitchIcon } from "../icons/Twitch";
import { UsersIcon } from "../icons/Users";
import {
	SideNav,
	SideNavFooter,
	SideNavGameStatus,
	SideNavHeader,
	SideNavLink,
} from "../SideNav";
import sideNavStyles from "../SideNav.module.css";
import { Footer } from "./Footer";
import styles from "./index.module.css";
import { LogInButtonContainer } from "./LogInButtonContainer";
import { NavDialog } from "./NavDialog";
import {
	NotificationContent,
	notificationPopoverClassName,
	useNotifications,
} from "./NotificationPopover";
import { TopNavMenus } from "./TopNavMenus";
import { TopRightButtons } from "./TopRightButtons";

function useTimeFormat() {
	const formatTime = (date: Date, options: Intl.DateTimeFormatOptions) => {
		return date.toLocaleTimeString("en-US", options);
	};
	return { formatTime };
}

const MOCK_STREAMS = [
	{
		id: 3,
		name: "Paddling Pool 252",
		imageUrl: "https://i.pravatar.cc/150?u=stream1",
		subtitle: "Losers Finals",
		badge: "LIVE",
	},
	{
		id: 1,
		name: "Splash Go!",
		imageUrl:
			"https://liquipedia.net/commons/images/7/73/Splash_Go_allmode.png",
		subtitle: "Tomorrow, 9:00 AM",
	},
	{
		id: 2,
		name: "Area Cup",
		imageUrl:
			"https://pbs.twimg.com/profile_images/1830601967821017088/4SDZVKdj_400x400.jpg",
		subtitle: "Saturday, 10 AM",
	},
];

const MOCK_FRIENDS = [
	{
		id: 1,
		name: "Splat_Master",
		avatarUrl: "https://i.pravatar.cc/150?u=friend1",
		subtitle: "SendouQ",
		badge: "2/4",
	},
	{
		id: 2,
		name: "InklingPro",
		avatarUrl: "https://i.pravatar.cc/150?u=friend2",
		subtitle: "Lobby",
		badge: "2/8",
	},
	{
		id: 3,
		name: "OctoKing",
		avatarUrl: "https://i.pravatar.cc/150?u=friend3",
		subtitle: "In The Zone 22",
		badge: "3/4",
	},
	{
		id: 4,
		name: "TurfWarrior",
		avatarUrl: "https://i.pravatar.cc/150?u=friend4",
		subtitle: "SendouQ",
		badge: "1/4",
	},
	{
		id: 5,
		name: "RankedGrinder",
		avatarUrl: "https://i.pravatar.cc/150?u=friend5",
		subtitle: "Lobby",
		badge: "5/8",
	},
];

function useBreadcrumbData() {
	const { t } = useTranslation();
	const matches = useMatches();

	const breadcrumbs: Breadcrumb[] = [];

	for (const match of [...matches].reverse()) {
		const handle = match.handle as SendouRouteHandle | undefined;
		const resolved = handle?.breadcrumb?.({ match, t });
		if (resolved) {
			const items = Array.isArray(resolved) ? resolved : [resolved];
			breadcrumbs.push(...items);
		}
	}

	return {
		breadcrumbs,
		currentPageText: breadcrumbs.at(-1)?.text,
	};
}

export function Layout({
	children,
	data,
}: {
	children: React.ReactNode;
	data?: RootLoaderData;
}) {
	const [navDialogOpen, setNavDialogOpen] = React.useState(false);
	const location = useLocation();

	const { t } = useTranslation(["front"]);
	const { formatTime } = useTimeFormat();

	const isFrontPage = location.pathname === "/";

	const showLeaderboard =
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
		!data?.user?.roles.includes("MINOR_SUPPORT") &&
		!location.pathname.includes("plans");
	return (
		<>
			<NavDialog isOpen={navDialogOpen} close={() => setNavDialogOpen(false)} />
			{isFrontPage ? (
				<SendouButton
					icon={<HamburgerIcon />}
					className={clsx(styles.hamburger, styles.fab)}
					variant="outlined"
					onPress={() => setNavDialogOpen(true)}
				/>
			) : null}
			<SideNav
				footer={
					<>
						<SideNavGameStatus
							iconUrl={navIconUrl("sendouq")}
							text="Match #92432 started!"
							href="/q/match/123"
						/>
						<SideNavFooter>
							<SideNavUserPanel />
						</SideNavFooter>
					</>
				}
				top={<SiteTitle />}
				topCentered={isFrontPage}
			>
				<SideNavHeader icon={<CalendarIcon />}>
					{t("front:sideNav.myCalendar")}
				</SideNavHeader>
				{data && data.tournaments.participatingFor.length > 0 ? (
					data.tournaments.participatingFor
						.slice(0, 4)
						.map((tournament, index) => (
							<SideNavLink
								key={tournament.id}
								href={tournament.url}
								imageUrl={tournament.logoUrl ?? undefined}
								subtitle={`${index < 2 ? "Today" : "Tomorrow"}, ${formatTime(
									new Date(tournament.startTime),
									{
										hour: "numeric",
										minute: "2-digit",
									},
								)}`}
							>
								{tournament.name}
							</SideNavLink>
						))
				) : (
					<div className={styles.sideNavEmpty}>
						{t("front:sideNav.noEvents")}
					</div>
				)}

				<SideNavHeader icon={<UsersIcon />}>
					{t("front:sideNav.friends")}
				</SideNavHeader>
				{MOCK_FRIENDS.map((friend) => (
					<SideNavLink
						key={friend.id}
						href=""
						imageUrl={friend.avatarUrl}
						subtitle={friend.subtitle}
						badge={friend.badge}
					>
						{friend.name}
					</SideNavLink>
				))}

				<SideNavHeader icon={<TwitchIcon />}>
					{t("front:sideNav.streams")}
				</SideNavHeader>
				{MOCK_STREAMS.map((stream) => (
					<SideNavLink
						key={stream.id}
						href=""
						imageUrl={stream.imageUrl}
						subtitle={stream.subtitle}
						badge={stream.badge}
					>
						{stream.name}
					</SideNavLink>
				))}
			</SideNav>
			<div className={styles.container}>
				<header className={styles.header}>
					<TopNavMenus />
					<TopRightButtons
						showSupport={Boolean(
							data &&
								!data?.user?.roles.includes("MINOR_SUPPORT") &&
								isFrontPage,
						)}
						showSearch={Boolean(data?.user)}
						openNavDialog={() => setNavDialogOpen(true)}
					/>
				</header>
				{showLeaderboard ? <MyRampUnit /> : null}
				{children}
				<Footer />
			</div>
		</>
	);
}

function SiteTitle() {
	const location = useLocation();
	const { breadcrumbs, currentPageText } = useBreadcrumbData();

	const isFrontPage = location.pathname === "/";
	const hasBreadcrumbs = breadcrumbs.length > 0;

	return (
		<Flipper flipKey={isFrontPage ? "front" : "other"}>
			<div className={styles.siteTitle}>
				<Flipped flipId="site-logo">
					{/** xxx: placeholder logo */}
					<Link to="/" className={styles.siteLogo}>
						S
					</Link>
				</Flipped>

				{hasBreadcrumbs ? (
					<>
						{breadcrumbs.map((crumb) => (
							<React.Fragment key={crumb.href}>
								<span className={styles.separator}>/</span>
								<PageIcon crumb={crumb} />
							</React.Fragment>
						))}

						{currentPageText ? (
							<span className={styles.pageName}>{currentPageText}</span>
						) : null}
					</>
				) : null}
			</div>
		</Flipper>
	);
}

function PageIcon({ crumb }: { crumb: Breadcrumb }) {
	if (crumb.type !== "IMAGE") {
		return null;
	}

	const isExternal = crumb.imgPath.includes(".");
	const iconClass = clsx(styles.pageIcon, "rounded");

	return isExternal ? (
		<img src={crumb.imgPath} alt="" className={iconClass} />
	) : (
		<Image
			path={crumb.imgPath}
			alt=""
			className={iconClass}
			width={20}
			height={20}
		/>
	);
}

function MyRampUnit() {
	return <div className="top-leaderboard" id="pw-leaderboard_atf" />;
}

function SideNavUserPanel() {
	const { t } = useTranslation();
	const user = useUser();
	const { notifications, unseenIds } = useNotifications();

	if (user) {
		return (
			<>
				<Link to={userPage(user)} className={sideNavStyles.sideNavFooterUser}>
					<Avatar user={user} size="xs" />
					<span className={sideNavStyles.sideNavFooterUsername}>
						{user.username}
					</span>
				</Link>
				<div className={sideNavStyles.sideNavFooterActions}>
					{notifications ? (
						<div className={sideNavStyles.sideNavFooterNotification}>
							{unseenIds.length > 0 ? (
								<div className={sideNavStyles.sideNavFooterUnseenDot} />
							) : null}
							<SendouPopover
								trigger={
									<Button
										className={sideNavStyles.sideNavFooterButton}
										data-testid="notifications-button"
									>
										<BellIcon />
									</Button>
								}
								popoverClassName={notificationPopoverClassName(
									notifications.length,
								)}
							>
								<NotificationContent
									notifications={notifications}
									unseenIds={unseenIds}
								/>
							</SendouPopover>
						</div>
					) : null}
					<Link
						to={SETTINGS_PAGE}
						className={sideNavStyles.sideNavFooterButton}
					>
						<GearIcon />
					</Link>
				</div>
			</>
		);
	}

	return (
		<LogInButtonContainer>
			<SendouButton type="submit" size="small" icon={<LogInIcon />}>
				{t("header.login.discord")}
			</SendouButton>
		</LogInButtonContainer>
	);
}
