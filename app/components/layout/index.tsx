import clsx from "clsx";
import { isToday, isTomorrow } from "date-fns";
import { Bell, Calendar, LogIn, Settings, Users } from "lucide-react";
import * as React from "react";
import { Button } from "react-aria-components";
import { Flipped, Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useLocation, useMatches } from "react-router";
import { useUser } from "~/features/auth/core/user";
import type { loader as sidebarLoader } from "~/features/sidebar/routes/sidebar";
import type { RootLoaderData } from "~/root";
import type { Breadcrumb, SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, SETTINGS_PAGE, userPage } from "~/utils/urls";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { Image } from "../Image";
import { TwitchIcon } from "../icons/Twitch";
import { MobileNav } from "../MobileNav";
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
	const { i18n } = useTranslation();

	const formatTime = (date: Date, options: Intl.DateTimeFormatOptions) => {
		return date.toLocaleTimeString(i18n.language, options);
	};

	const formatRelativeDay = (daysFromToday: number) => {
		const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
		const str = rtf.format(daysFromToday, "day");
		return str.charAt(0).toUpperCase() + str.slice(1);
	};

	const formatRelativeDate = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		const timeStr = formatTime(date, { hour: "numeric", minute: "2-digit" });

		if (isToday(date)) {
			return `${formatRelativeDay(0)}, ${timeStr}`;
		}
		if (isTomorrow(date)) {
			return `${formatRelativeDay(1)}, ${timeStr}`;
		}

		return date.toLocaleDateString(i18n.language, {
			weekday: "short",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	};

	return { formatTime, formatRelativeDate };
}

function useSidebarData() {
	const fetcher = useFetcher<typeof sidebarLoader>();

	React.useEffect(() => {
		if (fetcher.state === "idle" && !fetcher.data) {
			fetcher.load("/sidebar");
		}
	}, [fetcher]);

	return fetcher.data;
}

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
	const { formatRelativeDate } = useTimeFormat();
	const sidebarData = useSidebarData();

	const tournaments = sidebarData?.tournaments ?? [];
	const matchStatus = sidebarData?.matchStatus;
	const friends = sidebarData?.friends ?? [];
	const streams = sidebarData?.streams ?? [];

	const isFrontPage = location.pathname === "/";

	const showLeaderboard =
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
		!data?.user?.roles.includes("MINOR_SUPPORT") &&
		!location.pathname.includes("plans");
	return (
		<>
			<NavDialog isOpen={navDialogOpen} close={() => setNavDialogOpen(false)} />
			<SideNav
				footer={
					<>
						{matchStatus ? (
							<SideNavGameStatus
								iconUrl={navIconUrl("sendouq")}
								text={t("front:sideNav.matchStarted", {
									matchId: matchStatus.matchId,
								})}
								href={matchStatus.url}
							/>
						) : null}
						<SideNavFooter>
							<SideNavUserPanel />
						</SideNavFooter>
					</>
				}
				top={<SiteTitle />}
				topCentered={isFrontPage}
			>
				<SideNavHeader icon={<Calendar />}>
					{t("front:sideNav.myCalendar")}
				</SideNavHeader>
				{tournaments.length > 0 ? (
					tournaments.map((tournament) => (
						<SideNavLink
							key={tournament.id}
							to={tournament.url}
							imageUrl={tournament.logoUrl ?? undefined}
							subtitle={formatRelativeDate(tournament.startTime)}
						>
							{tournament.name}
						</SideNavLink>
					))
				) : (
					<div className={styles.sideNavEmpty}>
						{t("front:sideNav.noEvents")}
					</div>
				)}

				<SideNavHeader icon={<Users />}>
					{t("front:sideNav.friends")}
				</SideNavHeader>
				{friends.map((friend) => (
					<SideNavLink
						key={friend.id}
						to=""
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
				{streams.map((stream) => (
					<SideNavLink
						key={stream.id}
						to=""
						imageUrl={stream.imageUrl}
						subtitle={stream.subtitle}
						badge={stream.badge}
					>
						{stream.name}
					</SideNavLink>
				))}
			</SideNav>
			<MobileNav sidebarData={sidebarData} />
			<div className={styles.container}>
				<header className={styles.header}>
					<MobileLogo />
					<TopNavMenus />
					<TopRightButtons
						showSupport={Boolean(
							data &&
								!data?.user?.roles.includes("MINOR_SUPPORT") &&
								isFrontPage,
						)}
						showSearch={Boolean(data?.user)}
						isLoggedIn={Boolean(data?.user)}
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

function MobileLogo() {
	return (
		<Link to="/" className={styles.mobileLogo}>
			S
		</Link>
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
										<Bell />
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
						<Settings />
					</Link>
				</div>
			</>
		);
	}

	return (
		<LogInButtonContainer>
			<SendouButton type="submit" size="small" icon={<LogIn />}>
				{t("header.login.discord")}
			</SendouButton>
		</LogInButtonContainer>
	);
}
