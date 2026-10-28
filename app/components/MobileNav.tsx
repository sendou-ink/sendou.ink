import clsx from "clsx";
import {
	Calendar,
	ChevronRight,
	Heart,
	LogIn,
	Menu,
	MessageSquare,
	Settings,
	Tv,
	User,
	Users,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { ScheduleNudge } from "~/features/availability/components/ScheduleNudge";
import { useChatContext } from "~/features/chat/ChatProvider";
import { FriendMenu } from "~/features/friends/components/FriendMenu";
import { SENDOUQ_ACTIVITY_LABEL } from "~/features/friends/friends-constants";
import { useClosePopoversOnNavigation } from "~/hooks/useClosePopoversOnNavigation";
import { useHydrated } from "~/hooks/useHydrated";
import { useLayoutSize } from "~/hooks/useLayoutSize";
import { useScrollLock } from "~/hooks/useScrollLock";
import { useUnseenFriendRequests } from "~/hooks/useUnseenFriendRequests";
import type { RootLoaderData } from "~/root";
import {
	EVENTS_PAGE,
	FRIENDS_PAGE,
	navIconUrl,
	SENDOU_INK_BASE_URL,
	SETTINGS_PAGE,
	SUPPORT_PAGE,
	teamPage,
	userPage,
} from "~/utils/urls";
import { Avatar } from "./Avatar";
import { EventsList } from "./EventsList";
import {
	SendouBottomSheet,
	SendouBottomSheetCloseButton,
} from "./elements/BottomSheet";
import { LinkButton } from "./elements/Button";
import { isOwnToggle } from "./elements/Popover";
import { Image } from "./Image";
import { ChatSidebar } from "./layout/ChatSidebar";
import { LogInButtonContainer } from "./layout/LogInButtonContainer";
import {
	NotificationContent,
	useMarkNotificationsSeenWhileOpen,
	useNotifications,
} from "./layout/NotificationPopover";
import { navItems } from "./layout/nav-items";
import styles from "./MobileNav.module.css";
import { NotificationDot } from "./NotificationDot";
import { ShareUrlButton } from "./ShareUrlButton";
import { StreamListItems } from "./StreamListItems";

type SidebarData = RootLoaderData["sidebar"] | undefined;
type PanelType = (typeof PANEL_TYPES)[number];
type PanelIds = Record<PanelType, string>;
type PanelToggleHandler = (event: React.ToggleEvent<HTMLDivElement>) => void;
type TabClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => void;

const MOBILE_NAV_ID = "mobile-nav";
const PANEL_TYPES = ["menu", "friends", "tourneys", "chat", "you"] as const;

/**
 * The bottom tab bar and its panels. The panels are native popovers opened by
 * the tabs; opening one closes the other and the tab bar stays usable
 * underneath. The state here only mirrors them. The menu and the chat open
 * before hydration too; the other panels mount their contents on first open,
 * so their tabs work only once hydrated.
 *
 * The bar itself is a manual popover shown on hydration so it lives in the top
 * layer; before that it is a plain fixed bar.
 *
 * Once hydrated, while a panel is open every tab targets it, so pressing a tab
 * does not light dismiss it. The tab's click then swaps the panels in one go,
 * as on touch devices the click can come frames after the press.
 */
export function MobileNav({ sidebarData }: { sidebarData: SidebarData }) {
	const [activePanel, setActivePanel] = React.useState<PanelType | null>(null);
	const [skipAnimation, setSkipAnimation] = React.useState(false);
	const rootRef = React.useRef<HTMLDivElement>(null);
	const user = useUser();
	const { showUnseenDot } = useNotifications();
	const chatContext = useChatContext();
	const uid = React.useId();
	const panelIds = Object.fromEntries(
		PANEL_TYPES.map((panel) => [panel, panelDomId(uid, panel)]),
	) as PanelIds;

	useScrollLock(activePanel !== null);
	useClosePopoversOnNavigation(rootRef);

	const openChat = React.useEffectEvent(() => chatContext?.setChatOpen(true));

	React.useEffect(() => {
		// a panel can be opened before hydration, its toggle event long gone
		const openPanel = PANEL_TYPES.find((panel) =>
			document.getElementById(panelDomId(uid, panel))?.matches(":popover-open"),
		);
		if (openPanel) {
			setActivePanel(openPanel);
			if (openPanel === "chat") {
				openChat();
			}
		}

		const root = rootRef.current;
		if (!root || root.matches(":popover-open")) return;
		root.showPopover();
	}, [uid]);

	// currently only used to open chat when clicking on a mention notification
	const chatOpenRequest = chatContext?.chatOpenRequest ?? 0;
	const isMobileLayout = useLayoutSize() === "mobile";
	const handledChatOpenRequestRef = React.useRef(chatOpenRequest);

	React.useEffect(() => {
		if (chatOpenRequest === handledChatOpenRequestRef.current) return;
		handledChatOpenRequestRef.current = chatOpenRequest;
		if (!isMobileLayout) return;

		const chatPanel = document.getElementById(panelDomId(uid, "chat"));
		if (chatPanel && !chatPanel.matches(":popover-open")) {
			chatPanel.showPopover();
		}
	}, [chatOpenRequest, isMobileLayout, uid]);

	const hasFriendInSendouQ =
		sidebarData?.friends.some((f) => f.subtitle === SENDOUQ_ACTIVITY_LABEL) ??
		false;
	const unseenFriendRequests = useUnseenFriendRequests(
		sidebarData?.incomingFriendRequestIds ?? [],
	);

	const onPanelToggle =
		(panel: PanelType): PanelToggleHandler =>
		(event) => {
			if (!isOwnToggle(event)) return;

			const open = event.newState === "open";
			setActivePanel((current) =>
				open ? panel : current === panel ? null : current,
			);
			if (panel === "chat") {
				chatContext?.setChatOpen(open);
			}
		};

	const onTabClick =
		(panel: PanelType): TabClickHandler =>
		(event) => {
			const target = document.getElementById(panelIds[panel]);
			if (!target) return;
			event.preventDefault();

			if (target.matches(":popover-open")) {
				target.hidePopover();
				return;
			}

			// a panel taking another one's place appears in place instead of sliding up again
			setSkipAnimation(activePanel !== null);
			setActivePanel(panel);
			target.showPopover({ source: event.currentTarget });
		};

	return (
		<div
			id={MOBILE_NAV_ID}
			className={styles.mobileNav}
			ref={rootRef}
			popover="manual"
		>
			<MenuPanel
				id={panelIds.menu}
				streams={sidebarData?.streams ?? []}
				savedTournamentIds={sidebarData?.savedTournamentIds}
				skipAnimation={skipAnimation}
				onToggle={onPanelToggle("menu")}
			/>

			{user ? (
				<>
					<FriendsPanel
						id={panelIds.friends}
						friends={sidebarData?.friends ?? []}
						skipAnimation={skipAnimation}
						onToggle={onPanelToggle("friends")}
					/>
					<TourneysPanel
						id={panelIds.tourneys}
						events={sidebarData?.events ?? []}
						showScheduleNudge={sidebarData?.scheduleNudge ?? false}
						skipAnimation={skipAnimation}
						onToggle={onPanelToggle("tourneys")}
					/>
					<ChatPanel
						id={panelIds.chat}
						isOpen={activePanel === "chat"}
						skipAnimation={skipAnimation}
						onToggle={onPanelToggle("chat")}
					/>
					<YouPanel
						id={panelIds.you}
						isOpen={activePanel === "you"}
						skipAnimation={skipAnimation}
						onToggle={onPanelToggle("you")}
					/>
				</>
			) : null}

			<MobileTabBar
				panelIds={panelIds}
				activePanel={activePanel}
				onTabClick={onTabClick}
				isLoggedIn={Boolean(user)}
				hasUnseenNotifications={showUnseenDot}
				hasFriendInSendouQ={hasFriendInSendouQ}
				unseenFriendRequests={unseenFriendRequests}
			/>
		</div>
	);
}

function MobileTabBar({
	panelIds,
	activePanel,
	onTabClick,
	isLoggedIn,
	hasUnseenNotifications,
	hasFriendInSendouQ,
	unseenFriendRequests,
}: {
	panelIds: PanelIds;
	activePanel: PanelType | null;
	onTabClick: (panel: PanelType) => TabClickHandler;
	isLoggedIn: boolean;
	hasUnseenNotifications: boolean;
	hasFriendInSendouQ: boolean;
	unseenFriendRequests: number;
}) {
	const { t } = useTranslation(["front", "common"]);
	const chatContext = useChatContext();
	const isHydrated = useHydrated();
	const tabProps = (
		panel: PanelType,
		{ worksBeforeHydration = false } = {},
	) => ({
		popoverTarget:
			activePanel !== null
				? panelIds[activePanel]
				: isHydrated || worksBeforeHydration
					? panelIds[panel]
					: undefined,
		isActive: activePanel === panel,
		onClick: onTabClick(panel),
	});

	return (
		<nav className={styles.tabBar}>
			<MobileTab
				icon={<Menu />}
				label={t("front:mobileNav.menu")}
				{...tabProps("menu", { worksBeforeHydration: true })}
			/>

			{isLoggedIn ? (
				<>
					<MobileTab
						icon={<Users />}
						label={t("front:mobileNav.friends")}
						{...tabProps("friends")}
						showNotificationDot={hasFriendInSendouQ}
						badgeCount={unseenFriendRequests}
						badgeLeft={hasFriendInSendouQ}
					/>
					<MobileTab
						icon={<Calendar />}
						label={t("front:sideNav.myCalendar")}
						{...tabProps("tourneys")}
					/>
					<MobileTab
						icon={<MessageSquare />}
						label={t("front:mobileNav.chat")}
						{...tabProps("chat", { worksBeforeHydration: true })}
						unreadCount={chatContext?.totalUnreadCount}
					/>
					<MobileTab
						icon={<User />}
						label={t("front:mobileNav.you")}
						{...tabProps("you")}
						showNotificationDot={hasUnseenNotifications}
					/>
				</>
			) : (
				<LogInButtonContainer>
					<button type="submit" className={styles.tab}>
						<span className={styles.tabIcon}>
							<LogIn />
						</span>
						<span>{t("front:mobileNav.login")}</span>
					</button>
				</LogInButtonContainer>
			)}
		</nav>
	);
}

function MobileTab({
	icon,
	label,
	popoverTarget,
	isActive,
	onClick,
	showNotificationDot,
	unreadCount,
	badgeCount,
	badgeLeft,
}: {
	icon: React.ReactNode;
	label: string;
	popoverTarget?: string;
	isActive: boolean;
	onClick: TabClickHandler;
	showNotificationDot?: boolean;
	unreadCount?: number;
	badgeCount?: number;
	badgeLeft?: boolean;
}) {
	const count = unreadCount ?? badgeCount;

	return (
		<button
			type="button"
			className={styles.tab}
			data-active={isActive}
			popoverTarget={popoverTarget}
			onClick={onClick}
		>
			<span className={styles.tabIcon}>
				{icon}
				{showNotificationDot ? <NotificationDot /> : null}
				{count ? (
					<span
						className={clsx(styles.tabBadge, {
							[styles.tabBadgeLeft]: badgeLeft,
						})}
					>
						{count}
					</span>
				) : null}
			</span>
			<span>{label}</span>
		</button>
	);
}

function MenuPanel({
	id,
	streams,
	savedTournamentIds,
	skipAnimation,
	onToggle,
}: {
	id: string;
	streams: NonNullable<SidebarData>["streams"];
	savedTournamentIds?: number[];
	skipAnimation: boolean;
	onToggle: PanelToggleHandler;
}) {
	const { t } = useTranslation(["front", "common"]);
	const user = useUser();
	const location = useLocation();
	const titleId = `${id}-title`;

	return (
		<div
			id={id}
			popover="auto"
			role="dialog"
			aria-labelledby={titleId}
			className={clsx(
				styles.menuOverlay,
				"scrollbar",
				skipAnimation && styles.noAnimation,
			)}
			onToggle={onToggle}
		>
			<div className={styles.panelDialog}>
				<header className={styles.menuHeader}>
					<div className={styles.panelIconContainer}>
						<Menu size={18} />
					</div>
					<h2 id={titleId} className={styles.panelTitle}>
						{t("front:mobileNav.menu")}
					</h2>
					<div className={styles.menuHeaderActions}>
						{!user?.roles.includes("MINOR_SUPPORT") ? (
							<LinkButton
								to={SUPPORT_PAGE}
								size="small"
								icon={<Heart />}
								variant="ghost"
							>
								{t("common:pages.support")}
							</LinkButton>
						) : null}
						<ShareUrlButton
							variant="ghost"
							shape="square"
							url={`${SENDOU_INK_BASE_URL}${location.pathname}${location.search}`}
						/>
						<SendouBottomSheetCloseButton sheetId={id} />
					</div>
				</header>

				<nav aria-label={t("front:mobileNav.menu")}>
					<ul className={styles.navGrid}>
						{navItems.map((item) => (
							<li key={item.name}>
								<Link
									to={`/${item.url}`}
									prefetch="intent"
									className={styles.navItem}
								>
									<div className={styles.navItemImage}>
										<Image
											path={navIconUrl(item.name)}
											height={32}
											width={32}
											alt=""
										/>
									</div>
									<span>{t(`common:pages.${item.name}` as any)}</span>
								</Link>
							</li>
						))}
					</ul>
				</nav>

				<section>
					<header className={styles.menuHeader}>
						<div className={styles.panelIconContainer}>
							<Tv size={18} />
						</div>
						<h3 className={styles.panelTitle}>{t("front:sideNav.streams")}</h3>
					</header>
					{streams.length === 0 ? (
						<div className={styles.sideNavEmpty}>
							{t("front:sideNav.noStreams")}
						</div>
					) : null}
					<ul className={styles.streamsList}>
						<StreamListItems
							streams={streams}
							isLoggedIn={Boolean(user)}
							savedTournamentIds={savedTournamentIds}
						/>
					</ul>
				</section>
			</div>
		</div>
	);
}

function FriendsPanel({
	id,
	friends,
	skipAnimation,
	onToggle,
}: {
	id: string;
	friends: NonNullable<SidebarData>["friends"];
	skipAnimation: boolean;
	onToggle: PanelToggleHandler;
}) {
	const { t } = useTranslation(["front", "common"]);

	return (
		<SendouBottomSheet
			id={id}
			title={t("front:sideNav.friends")}
			icon={<Users size={18} />}
			skipAnimation={skipAnimation}
			onToggle={onToggle}
		>
			{friends.length > 0 ? (
				friends.map((friend) => <FriendMenu key={friend.id} {...friend} />)
			) : (
				<div className={styles.sideNavEmpty}>
					{t("front:sideNav.friends.noFriends")}
				</div>
			)}
			<Link
				to={FRIENDS_PAGE}
				prefetch="intent"
				className={styles.panelSectionLink}
			>
				{t("common:actions.viewAll")}
				<ChevronRight size={14} />
			</Link>
		</SendouBottomSheet>
	);
}

function TourneysPanel({
	id,
	events,
	showScheduleNudge,
	skipAnimation,
	onToggle,
}: {
	id: string;
	events: NonNullable<SidebarData>["events"];
	showScheduleNudge: boolean;
	skipAnimation: boolean;
	onToggle: PanelToggleHandler;
}) {
	const { t } = useTranslation(["front", "common"]);

	return (
		<SendouBottomSheet
			id={id}
			title={t("front:sideNav.myCalendar")}
			icon={<Calendar size={18} />}
			skipAnimation={skipAnimation}
			onToggle={onToggle}
		>
			{showScheduleNudge ? <ScheduleNudge panel /> : null}
			<EventsList events={events} />
			<Link
				to={EVENTS_PAGE}
				prefetch="intent"
				className={styles.panelSectionLink}
			>
				{t("common:actions.viewAll")}
				<ChevronRight size={14} />
			</Link>
		</SendouBottomSheet>
	);
}

function YouPanel({
	id,
	isOpen,
	skipAnimation,
	onToggle,
}: {
	id: string;
	isOpen: boolean;
	skipAnimation: boolean;
	onToggle: PanelToggleHandler;
}) {
	const { t } = useTranslation(["front", "common"]);
	const user = useUser();
	const { notifications, unseenIds } = useNotifications();
	useMarkNotificationsSeenWhileOpen(unseenIds, isOpen);

	if (!user) {
		return null;
	}

	return (
		<SendouBottomSheet
			id={id}
			title={t("front:mobileNav.you")}
			icon={<User size={18} />}
			skipAnimation={skipAnimation}
			onToggle={onToggle}
		>
			<div className={styles.youPanelUserRow}>
				<Link
					to={userPage(user)}
					prefetch="intent"
					className={styles.youPanelUser}
				>
					<Avatar user={user} size="sm" />
					<span className={styles.youPanelUsername}>{user.username}</span>
				</Link>
				{user.team ? (
					<Link
						to={teamPage(user.team.customUrl)}
						prefetch="intent"
						className={styles.youPanelSettingsButton}
						aria-label={t("common:header.myTeam")}
					>
						{user.team.avatarUrl ? (
							<img
								src={user.team.avatarUrl}
								alt=""
								className={styles.youPanelTeamAvatar}
								width={22}
								height={22}
							/>
						) : (
							<Image path={navIconUrl("t")} alt="" width={22} height={22} />
						)}
					</Link>
				) : null}
				<Link
					to={SETTINGS_PAGE}
					prefetch="intent"
					className={styles.youPanelSettingsButton}
					aria-label={t("common:pages.settings")}
				>
					<Settings size={18} />
				</Link>
			</div>

			<NotificationContent notifications={notifications} isOpen={isOpen} />
		</SendouBottomSheet>
	);
}

/** The chat needs JavaScript regardless, so unlike the other panels this one fills in only once open. */
function ChatPanel({
	id,
	isOpen,
	skipAnimation,
	onToggle,
}: {
	id: string;
	isOpen: boolean;
	skipAnimation: boolean;
	onToggle: PanelToggleHandler;
}) {
	const { t } = useTranslation(["front"]);
	const panelRef = React.useRef<HTMLDivElement>(null);

	return (
		<div
			ref={panelRef}
			id={id}
			popover="auto"
			role="dialog"
			aria-label={t("front:mobileNav.chat")}
			className={clsx(styles.menuOverlay, skipAnimation && styles.noAnimation)}
			onToggle={onToggle}
		>
			<div className={styles.panelDialog}>
				{isOpen ? (
					<ChatSidebar onClose={() => panelRef.current?.hidePopover()} />
				) : null}
			</div>
		</div>
	);
}

function panelDomId(uid: string, panel: PanelType) {
	return `${uid}-${panel}`;
}
