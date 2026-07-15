import clsx from "clsx";
import { isToday, isTomorrow } from "date-fns";
import {
	Bell,
	Calendar,
	ChevronRight,
	LogIn,
	PanelLeft,
	Settings,
	Tv,
	Users,
} from "lucide-react";
import * as React from "react";
import {
	Button,
	Dialog,
	DialogTrigger,
	Modal,
	ModalOverlay,
} from "react-aria-components";
import { Flipped, Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import {
	Link,
	useFetcher,
	useLocation,
	useMatches,
	useSearchParams,
} from "react-router";
import { Config } from "~/config";
import { useUser } from "~/features/auth/core/user";
import { useChatContext } from "~/features/chat/useChatContext";
import { FriendMenu } from "~/features/friends/components/FriendMenu";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useHydrated } from "~/hooks/useHydrated";
import { useLayoutSize } from "~/hooks/useMainContentWidth";
import { usePrefersReducedMotion } from "~/hooks/usePrefersReducedMotion";
import { useUnseenFriendRequests } from "~/hooks/useUnseenFriendRequests";
import { useVisualViewportHeight } from "~/hooks/useVisualViewportHeight";
import type { RootLoaderData } from "~/root";
import type { Breadcrumb, SendouRouteHandle } from "~/utils/remix.server";
import {
	EVENTS_PAGE,
	FRIENDS_PAGE,
	PLANNER_URL,
	SETTINGS_PAGE,
	userPage,
} from "~/utils/urls";
import { Avatar, generateIdenticon } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { FuseZone } from "../fuse/Fuse";
import { Image } from "../Image";
import { MobileNav } from "../MobileNav";
import { NotificationDot } from "../NotificationDot";
import { ListLink, SideNav, SideNavFooter, SideNavHeader } from "../SideNav";
import sideNavStyles from "../SideNav.module.css";
import { StreamListItems } from "../StreamListItems";
import { Footer } from "./Footer";
import styles from "./index.module.css";
import { LazyChatSidebar } from "./LazyChatSidebar";
import { LogInButtonContainer } from "./LogInButtonContainer";
import { NotificationContent, useNotifications } from "./NotificationPopover";
import notificationPopoverStyles from "./NotificationPopover.module.css";
import { TopNavMenus } from "./TopNavMenus";
import { TopRightButtons } from "./TopRightButtons";

const MAX_DESKTOP_FRIENDS = 4;

// lazy loaded so the rarely needed auth error dialog stays out of the eager
// bundle loaded on every page
const AuthErrorDialog = React.lazy(() =>
	import("./AuthErrorDialog").then((module) => ({
		default: module.AuthErrorDialog,
	})),
);

/** Id of the loading-bar track rendered inside the header. NProgress mounts its
 * bar into it; the track sits just below the header border, spans only the area
 * between the sidebars, and clips the bar so it never extends over a sidebar.
 * Living inside the header makes it follow the header on scroll and in
 * standalone (PWA) mode where the header grows by the safe-area inset. */
export const NPROGRESS_ANCHOR_ID = "nprogress-anchor";

function useRelativeDayFormat() {
	const { i18n } = useTranslation();
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
	});
	const { formatter: dateTimeFormatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});

	const formatRelativeDay = (daysFromToday: number) => {
		const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
		const str = rtf.format(daysFromToday, "day");
		return str.charAt(0).toUpperCase() + str.slice(1);
	};

	const formatRelativeDate = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		const timeStr = timeFormatter.format(date);

		if (isToday(date)) {
			return `${formatRelativeDay(0)}, ${timeStr}`;
		}
		if (isTomorrow(date)) {
			return `${formatRelativeDay(1)}, ${timeStr}`;
		}

		return dateTimeFormatter.format(date);
	};

	return { formatRelativeDate };
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

function useSideNavCollapsed(initialCollapsed: boolean) {
	const [collapsed, setCollapsed] = React.useState(initialCollapsed);
	const fetcher = useFetcher();

	const setCollapsedAndPersist = (value: boolean) => {
		setCollapsed(value);
		fetcher.submit(
			{ collapsed: String(value) },
			{ method: "POST", action: "/sidenav" },
		);
	};

	return [collapsed, setCollapsedAndPersist] as const;
}

function useNavOffset(headerRef: React.RefObject<HTMLElement | null>) {
	const [navOffset, setNavOffset] = React.useState(0);
	const lastScrollY = React.useRef(0);

	const MOBILE_BREAKPOINT = 600;
	const NAV_HEIGHT_FALLBACK = 55;
	const SCROLL_THRESHOLD_PX = 200;

	const scrollAccumulator = React.useRef(0);

	React.useEffect(() => {
		const handleScroll = () => {
			if (window.innerWidth >= MOBILE_BREAKPOINT) {
				setNavOffset(0);
				lastScrollY.current = window.scrollY;
				scrollAccumulator.current = 0;
				return;
			}

			const navHeight = headerRef.current?.offsetHeight ?? NAV_HEIGHT_FALLBACK;
			const currentScrollY = window.scrollY;
			const scrollDelta = currentScrollY - lastScrollY.current;

			const directionChanged =
				(scrollDelta > 0 && scrollAccumulator.current < 0) ||
				(scrollDelta < 0 && scrollAccumulator.current > 0);

			if (directionChanged) {
				scrollAccumulator.current = 0;
			}

			scrollAccumulator.current += scrollDelta;

			if (Math.abs(scrollAccumulator.current) >= SCROLL_THRESHOLD_PX) {
				const overflow =
					scrollAccumulator.current > 0
						? scrollAccumulator.current - SCROLL_THRESHOLD_PX
						: scrollAccumulator.current + SCROLL_THRESHOLD_PX;

				setNavOffset((prevOffset) => {
					const newOffset = prevOffset - overflow;
					return Math.max(-navHeight, Math.min(0, newOffset));
				});

				scrollAccumulator.current =
					scrollAccumulator.current > 0
						? SCROLL_THRESHOLD_PX
						: -SCROLL_THRESHOLD_PX;
			}

			lastScrollY.current = currentScrollY;
		};

		const handleResize = () => {
			if (window.innerWidth >= MOBILE_BREAKPOINT) {
				setNavOffset(0);
			}
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleResize);
		};
	}, [headerRef]);

	return navOffset;
}

export function Layout({
	children,
	data,
}: {
	children: React.ReactNode;
	data?: RootLoaderData;
}) {
	const chatContext = useChatContext();
	const [sideNavCollapsed, setSideNavCollapsed] = useSideNavCollapsed(
		data?.sidenavCollapsed ?? false,
	);
	const [sideNavModalOpen, setSideNavModalOpen] = React.useState(false);
	const [chatSidebarModalOpen, setChatSidebarModalOpen] = React.useState(false);

	const layoutSize = useLayoutSize();
	useVisualViewportHeight();
	const chatSidebarOpen = chatContext?.chatOpen ?? false;
	const setChatSidebarOpen = chatContext?.setChatOpen ?? (() => {});

	const setChatSidebarModalOpenAndSync = (open: boolean) => {
		setChatSidebarModalOpen(open);
		setChatSidebarOpen(open);
	};

	const { t } = useTranslation(["front", "common", "friends"]);
	const { formatRelativeDate } = useRelativeDayFormat();
	const isHydrated = useHydrated();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const headerRef = React.useRef<HTMLElement>(null);
	const navOffset = useNavOffset(headerRef);

	React.useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth < 600 || window.innerWidth >= 1000) {
				setSideNavModalOpen(false);
				setChatSidebarModalOpen(false);
			}
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	React.useEffect(() => {
		setSideNavModalOpen(false);
		setChatSidebarModalOpen(false);
	}, [location.pathname]);

	const user = useUser();
	const { unseenIds } = useNotifications();
	const sidebarData = data?.sidebar;
	const events = sidebarData?.events ?? [];
	const friends = sidebarData?.friends ?? [];
	const unseenFriendRequests = useUnseenFriendRequests(
		sidebarData?.incomingFriendRequestIds ?? [],
	);
	const streams = sidebarData?.streams ?? [];

	const isFrontPage = location.pathname === "/";

	const showLeaderboard =
		Config.fuseEnabled &&
		!data?.user?.roles.includes("MINOR_SUPPORT") &&
		!location.pathname.includes("plans");

	const sideNavFooterContent = (
		<SideNavFooter>
			<SideNavUserPanel />
		</SideNavFooter>
	);

	const sideNavChildren = (
		<>
			<SideNavHeader
				icon={<Calendar />}
				action={
					user ? (
						<Link to={EVENTS_PAGE} className={styles.viewAllLink}>
							{t("common:actions.viewAll")}
							<ChevronRight size={14} />
						</Link>
					) : null
				}
			>
				{t("front:sideNav.myCalendar")}
			</SideNavHeader>
			{events.length > 0 ? (
				events.map((event) => (
					<ListLink
						key={`${event.type}-${event.id}`}
						to={event.url}
						imageUrl={event.logoUrl ?? undefined}
						subtitle={
							isHydrated ? (
								formatRelativeDate(event.startTime)
							) : (
								<span className="invisible">Placeholder</span>
							)
						}
					>
						{event.scrimStatus === "booked"
							? t("front:sideNav.scrimVs", { opponent: event.name })
							: event.scrimStatus === "looking"
								? t("front:sideNav.lookingForScrim")
								: event.scrimStatus === "requestPending"
									? t("front:sideNav.scrimRequestPending")
									: event.name}
					</ListLink>
				))
			) : (
				<div className={styles.sideNavEmpty}>{t("front:sideNav.noEvents")}</div>
			)}

			<SideNavHeader
				icon={<Users />}
				action={
					user ? (
						<>
							{unseenFriendRequests > 0 ? (
								<span
									className={styles.friendRequestsBadge}
									role="status"
									aria-label={t("friends:unseenRequests", {
										count: unseenFriendRequests,
									})}
								>
									{unseenFriendRequests}
								</span>
							) : null}
							<Link to={FRIENDS_PAGE} className={styles.viewAllLink}>
								{t("common:actions.viewAll")}
								<ChevronRight size={14} />
							</Link>
						</>
					) : null
				}
			>
				{t("front:sideNav.friends")}
			</SideNavHeader>
			{friends.length > 0 ? (
				friends
					.slice(0, MAX_DESKTOP_FRIENDS)
					.map((friend) => <FriendMenu key={friend.id} {...friend} />)
			) : (
				<div className={styles.sideNavEmpty}>
					{user
						? t("front:sideNav.friends.noFriends")
						: t("front:sideNav.friends.notLoggedIn")}
				</div>
			)}

			<SideNavHeader icon={<Tv />}>{t("front:sideNav.streams")}</SideNavHeader>
			{streams.length === 0 ? (
				<div className={styles.sideNavEmpty}>
					{t("front:sideNav.noStreams")}
				</div>
			) : null}
			<StreamListItems
				streams={streams}
				isLoggedIn={Boolean(user)}
				savedTournamentIds={sidebarData?.savedTournamentIds}
			/>
		</>
	);

	return (
		<>
			<SideNav
				className={showLeaderboard ? styles.sidebarFuseSpace : undefined}
				collapsed={sideNavCollapsed}
				footer={sideNavFooterContent}
				top={<SiteTitle />}
				topCentered={isFrontPage}
			>
				{sideNavChildren}
			</SideNav>
			<MobileNav sidebarData={data?.sidebar} />
			<div className={styles.container}>
				<header
					ref={headerRef}
					className={styles.header}
					style={{
						transform: `translateY(${navOffset}px)`,
					}}
				>
					<Link to="/" className={clsx(styles.siteLogo, styles.mobileLogo)}>
						<SiteLogoContent />
					</Link>
					<DialogTrigger
						isOpen={sideNavModalOpen}
						onOpenChange={setSideNavModalOpen}
					>
						<SideNavCollapseButton
							className={styles.sideNavModalTrigger}
							showNotificationDot={!sideNavModalOpen && unseenIds.length > 0}
							badgeCount={!sideNavModalOpen ? unseenFriendRequests : 0}
							testId="sidenav-modal-trigger"
						/>
						<ModalOverlay className={styles.sideNavModalOverlay} isDismissable>
							<Modal className={styles.sideNavModal}>
								<Dialog className={styles.sideNavModalDialog}>
									<SideNav
										className={styles.sideNavInModal}
										footer={sideNavFooterContent}
										top={<SiteTitle />}
										topCentered={isFrontPage}
									>
										{sideNavChildren}
									</SideNav>
								</Dialog>
							</Modal>
						</ModalOverlay>
					</DialogTrigger>
					<ModalOverlay
						className={styles.chatSidebarModalOverlay}
						isDismissable
						isOpen={chatSidebarModalOpen}
						onOpenChange={setChatSidebarModalOpenAndSync}
					>
						<Modal className={styles.chatSidebarModal}>
							<Dialog
								className={styles.chatSidebarModalDialog}
								aria-label={t("common:chat.sidebar.title")}
							>
								<LazyChatSidebar />
							</Dialog>
						</Modal>
					</ModalOverlay>
					<SideNavCollapseButton
						onToggle={() => setSideNavCollapsed(!sideNavCollapsed)}
						className={styles.sideNavCollapseButton}
						showNotificationDot={sideNavCollapsed && unseenIds.length > 0}
						badgeCount={sideNavCollapsed ? unseenFriendRequests : 0}
						testId="sidenav-collapse-button"
					/>
					<TopNavMenus />
					<TopRightButtons
						showSupport={Boolean(
							data && !data?.user?.roles.includes("MINOR_SUPPORT"),
						)}
						showSearch={Boolean(data?.user)}
						isLoggedIn={Boolean(data?.user)}
						onChatToggle={
							data?.user && !chatSidebarOpen
								? () => setChatSidebarOpen(true)
								: undefined
						}
						onChatModalToggle={
							data?.user
								? () => setChatSidebarModalOpenAndSync(!chatSidebarModalOpen)
								: undefined
						}
						chatUnreadCount={chatContext?.totalUnreadCount}
					/>
					<div id={NPROGRESS_ANCHOR_ID} aria-hidden />
				</header>
				{showLeaderboard ? (
					<FuseZone
						id="fuse-header"
						fuseSlot="header"
						className="top-leaderboard"
					/>
				) : null}
				{children}
				<Footer />
			</div>
			{chatSidebarOpen && layoutSize === "desktop" ? (
				<div
					className={clsx(
						styles.chatSidebar,
						showLeaderboard && styles.sidebarFuseSpace,
					)}
				>
					<LazyChatSidebar onClose={() => setChatSidebarOpen(false)} />
				</div>
			) : null}
			{searchParams.has("authError") ? (
				<React.Suspense>
					<AuthErrorDialog />
				</React.Suspense>
			) : null}
		</>
	);
}

function SiteTitle() {
	const location = useLocation();
	const prefersReducedMotion = usePrefersReducedMotion();
	const { breadcrumbs, currentPageText } = useBreadcrumbData();

	const isFrontPage = location.pathname === "/";
	const hasBreadcrumbs = breadcrumbs.length > 0;

	return (
		<Flipper
			flipKey={isFrontPage ? "front" : "other"}
			className={styles.siteTitleFlipper}
			decisionData={{ pathname: location.pathname }}
		>
			<div className={styles.siteTitle}>
				<Flipped
					flipId="site-logo"
					shouldFlip={(prev, current) =>
						!prefersReducedMotion &&
						prev?.pathname !== PLANNER_URL &&
						current?.pathname !== PLANNER_URL
					}
				>
					<Link to="/" className={styles.siteLogo}>
						<SiteLogoContent />
					</Link>
				</Flipped>

				{hasBreadcrumbs ? (
					<>
						{breadcrumbs.map((crumb) => {
							const isCurrentPage = location.pathname === crumb.href;

							return (
								<React.Fragment key={crumb.href}>
									<span className={styles.separator}>/</span>
									{isCurrentPage ? (
										<PageIcon crumb={crumb} />
									) : (
										<Link to={crumb.href} className={styles.breadcrumbLink}>
											<PageIcon crumb={crumb} />
										</Link>
									)}
								</React.Fragment>
							);
						})}

						{currentPageText ? (
							<span className={styles.pageName}>{currentPageText}</span>
						) : null}
					</>
				) : null}
			</div>
		</Flipper>
	);
}

function SiteLogoContent() {
	return (
		<>
			<span className={styles.siteLogoS}>S</span>
			<span className={styles.siteLogoInk}>ink</span>
		</>
	);
}

function SideNavCollapseButton({
	onToggle,
	className,
	showNotificationDot,
	badgeCount,
	testId,
}: {
	onToggle?: () => void;
	className?: string;
	showNotificationDot?: boolean;
	badgeCount?: number;
	testId?: string;
}) {
	const { t } = useTranslation(["friends"]);

	return (
		<div className={styles.sideNavCollapseButtonContainer} data-testid={testId}>
			<SendouButton
				className={className}
				variant="minimal"
				size="small"
				shape="square"
				icon={<PanelLeft />}
				onPress={onToggle}
			/>
			{showNotificationDot ? <NotificationDot /> : null}
			{badgeCount ? (
				<span
					className={clsx(styles.sideNavCollapseBadge, {
						[styles.sideNavCollapseBadgeLeft]: showNotificationDot,
					})}
					role="status"
					aria-label={t("friends:unseenRequests", { count: badgeCount })}
				>
					{badgeCount}
				</span>
			) : null}
		</div>
	);
}

function PageIcon({ crumb }: { crumb: Breadcrumb }) {
	const [isErrored, setIsErrored] = React.useState(false);
	const isClient = useHydrated();

	if (crumb.type !== "IMAGE") {
		return null;
	}

	const lastPathSegment = crumb.imgPath.split("/").pop() ?? "";
	const isExternal = lastPathSegment.includes(".");
	const iconClass = clsx(styles.pageIcon, "rounded");

	// an <img> can finish loading (and fail) before React hydrates and attaches onError, so that
	// error is missed — re-check on mount and fall back manually so SSR'd icons still heal
	const checkAlreadyErrored = (img: HTMLImageElement | null) => {
		if (img?.complete && img.naturalWidth === 0) setIsErrored(true);
	};

	const identiconSrc =
		isErrored && isClient && crumb.identiconInput
			? generateIdenticon(crumb.identiconInput, 28, 7)
			: null;

	return (
		<div className={styles.pageIconWrapper}>
			{isExternal ? (
				<img
					ref={checkAlreadyErrored}
					src={identiconSrc ?? crumb.imgPath}
					alt=""
					className={iconClass}
					width={28}
					height={28}
					onError={() => setIsErrored(true)}
				/>
			) : (
				<Image
					path={crumb.imgPath}
					alt=""
					className={iconClass}
					width={20}
					height={20}
				/>
			)}
		</div>
	);
}

function SideNavUserPanel() {
	const { t } = useTranslation();
	const location = useLocation();
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
						<div
							className={sideNavStyles.sideNavFooterNotification}
							key={location.pathname}
						>
							{unseenIds.length > 0 ? (
								<NotificationDot
									className={sideNavStyles.sideNavFooterUnseenDot}
								/>
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
								popoverClassName={clsx(
									notificationPopoverStyles.popoverContainer,
									{
										[notificationPopoverStyles.noNotificationsContainer]:
											notifications.length === 0,
									},
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
		<>
			<LogInButtonContainer>
				<SendouButton type="submit" size="small" icon={<LogIn />}>
					{t("header.login.discord")}
				</SendouButton>
			</LogInButtonContainer>
			<div className={sideNavStyles.sideNavFooterActions}>
				<Link to={SETTINGS_PAGE} className={sideNavStyles.sideNavFooterButton}>
					<Settings />
				</Link>
			</div>
		</>
	);
}
