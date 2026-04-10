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
import { Link, useFetcher, useLocation, useMatches } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { useChatContext } from "~/features/chat/useChatContext";
import { FriendMenu } from "~/features/friends/components/FriendMenu";
import { useHydrated } from "~/hooks/useHydrated";
import type { RootLoaderData } from "~/root";
import type { Breadcrumb, SendouRouteHandle } from "~/utils/remix.server";
import {
	EVENTS_PAGE,
	FRIENDS_PAGE,
	SETTINGS_PAGE,
	userPage,
} from "~/utils/urls";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { FuseZone } from "../fuse/Fuse";
import { Image } from "../Image";
import { MobileNav } from "../MobileNav";
import { NotificationDot } from "../NotificationDot";
import { ListLink, SideNav, SideNavFooter, SideNavHeader } from "../SideNav";
import sideNavStyles from "../SideNav.module.css";
import { StreamListItems } from "../StreamListItems";
import { ChatSidebar } from "./ChatSidebar";
import { Footer } from "./Footer";
import styles from "./index.module.css";
import { LogInButtonContainer } from "./LogInButtonContainer";
import { NotificationContent, useNotifications } from "./NotificationPopover";
import notificationPopoverStyles from "./NotificationPopover.module.css";
import { TopNavMenus } from "./TopNavMenus";
import { TopRightButtons } from "./TopRightButtons";

const MAX_DESKTOP_FRIENDS = 4;

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
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	};

	return { formatTime, formatRelativeDate };
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

	const chatSidebarOpen = chatContext?.chatOpen ?? false;
	const setChatSidebarOpen = chatContext?.setChatOpen ?? (() => {});

	const { t } = useTranslation(["front", "common"]);
	const { formatRelativeDate } = useTimeFormat();
	const isHydrated = useHydrated();
	const location = useLocation();
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally close modals on navigation
	React.useEffect(() => {
		setSideNavModalOpen(false);
		setChatSidebarModalOpen(false);
	}, [location.pathname]);

	const user = useUser();
	const { unseenIds } = useNotifications();
	const sidebarData = data?.sidebar;
	const events = sidebarData?.events ?? [];
	const friends = sidebarData?.friends ?? [];
	const streams = sidebarData?.streams ?? [];

	const isFrontPage = location.pathname === "/";

	const showLeaderboard =
		import.meta.env.VITE_FUSE_ENABLED &&
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
						<Link to={FRIENDS_PAGE} className={styles.viewAllLink}>
							{t("common:actions.viewAll")}
							<ChevronRight size={14} />
						</Link>
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
					<DialogTrigger
						isOpen={chatSidebarModalOpen}
						onOpenChange={setChatSidebarModalOpen}
					>
						<ModalOverlay
							className={styles.chatSidebarModalOverlay}
							isDismissable
						>
							<Modal className={styles.chatSidebarModal}>
								<Dialog className={styles.chatSidebarModalDialog}>
									<ChatSidebar />
								</Dialog>
							</Modal>
						</ModalOverlay>
					</DialogTrigger>
					<SideNavCollapseButton
						onToggle={() => setSideNavCollapsed(!sideNavCollapsed)}
						className={styles.sideNavCollapseButton}
						showNotificationDot={sideNavCollapsed && unseenIds.length > 0}
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
								? () => setChatSidebarModalOpen((prev) => !prev)
								: undefined
						}
						chatUnreadCount={chatContext?.totalUnreadCount}
					/>
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
			{chatSidebarOpen ? (
				<div
					className={clsx(
						styles.chatSidebar,
						showLeaderboard && styles.sidebarFuseSpace,
					)}
				>
					<ChatSidebar onClose={() => setChatSidebarOpen(false)} />
				</div>
			) : null}
		</>
	);
}

function SiteTitle() {
	const location = useLocation();
	const { breadcrumbs, currentPageText } = useBreadcrumbData();

	const isFrontPage = location.pathname === "/";
	const hasBreadcrumbs = breadcrumbs.length > 0;

	return (
		<Flipper
			flipKey={isFrontPage ? "front" : "other"}
			className={styles.siteTitleFlipper}
		>
			<div className={styles.siteTitle}>
				<Flipped flipId="site-logo">
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
	testId,
}: {
	onToggle?: () => void;
	className?: string;
	showNotificationDot?: boolean;
	testId?: string;
}) {
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
		</div>
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
