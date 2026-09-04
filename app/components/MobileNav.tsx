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
	X,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { ScheduleNudge } from "~/features/availability/components/ScheduleNudge";
import { useChatContext } from "~/features/chat/ChatProvider";
import { FriendMenu } from "~/features/friends/components/FriendMenu";
import { SENDOUQ_ACTIVITY_LABEL } from "~/features/friends/friends-constants";
import { canAccessTrophies } from "~/features/trophies/trophies-utils";
import { useClosePopoversOnNavigation } from "~/hooks/useClosePopoversOnNavigation";
import { useUnseenFriendRequests } from "~/hooks/useUnseenFriendRequests";
import type { RootLoaderData } from "~/root";
import {
	EVENTS_PAGE,
	FRIENDS_PAGE,
	navIconUrl,
	SENDOU_INK_BASE_URL,
	SETTINGS_PAGE,
	SUPPORT_PAGE,
	userPage,
} from "~/utils/urls";
import { Avatar } from "./Avatar";
import { EventsList } from "./EventsList";
import { LinkButton } from "./elements/Button";
import { isOwnToggle } from "./elements/Popover";
import { Image } from "./Image";
import { LazyChatSidebar } from "./layout/LazyChatSidebar";
import { LogInButtonContainer } from "./layout/LogInButtonContainer";
import {
	NotificationContent,
	useNotifications,
} from "./layout/NotificationPopover";
import { navItems } from "./layout/nav-items";
import styles from "./MobileNav.module.css";
import { NotificationDot } from "./NotificationDot";
import { ShareUrlButton } from "./ShareUrlButton";
import { StreamListItems } from "./StreamListItems";

type SidebarData = RootLoaderData["sidebar"] | undefined;
type PanelType = "menu" | "friends" | "tourneys" | "chat" | "you";
type PanelIds = Record<PanelType, string>;
type PanelToggleHandler = (event: React.ToggleEvent<HTMLDivElement>) => void;

/**
 * The bottom tab bar and its panels. The panels are native popovers opened by
 * the tabs, so they work before hydration; opening one closes the other and the
 * tab bar stays usable underneath. The state here only mirrors them.
 */
export function MobileNav({ sidebarData }: { sidebarData: SidebarData }) {
	const [activePanel, setActivePanel] = React.useState<PanelType | null>(null);
	const [skipAnimation, setSkipAnimation] = React.useState(false);
	const rootRef = React.useRef<HTMLDivElement>(null);
	const user = useUser();
	const { showUnseenDot } = useNotifications();
	const chatContext = useChatContext();
	const uid = React.useId();
	const panelIds: PanelIds = {
		menu: `${uid}-menu`,
		friends: `${uid}-friends`,
		tourneys: `${uid}-tourneys`,
		chat: `${uid}-chat`,
		you: `${uid}-you`,
	};

	useClosePopoversOnNavigation(rootRef);

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

	// a panel taking another one's place appears in place instead of sliding
	// up again; decided as the tab is pressed, before the popovers switch
	const rememberOpenPanel = () => setSkipAnimation(activePanel !== null);

	return (
		<div className={styles.mobileNav} ref={rootRef}>
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
				onBeforeToggle={rememberOpenPanel}
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
	onBeforeToggle,
	isLoggedIn,
	hasUnseenNotifications,
	hasFriendInSendouQ,
	unseenFriendRequests,
}: {
	panelIds: PanelIds;
	activePanel: PanelType | null;
	onBeforeToggle: () => void;
	isLoggedIn: boolean;
	hasUnseenNotifications: boolean;
	hasFriendInSendouQ: boolean;
	unseenFriendRequests: number;
}) {
	const { t } = useTranslation(["front", "common"]);
	const chatContext = useChatContext();

	return (
		<nav className={styles.tabBar}>
			<MobileTab
				icon={<Menu />}
				label={t("front:mobileNav.menu")}
				panelId={panelIds.menu}
				isActive={activePanel === "menu"}
				onBeforeToggle={onBeforeToggle}
			/>

			{isLoggedIn ? (
				<>
					<MobileTab
						icon={<Users />}
						label={t("front:mobileNav.friends")}
						panelId={panelIds.friends}
						isActive={activePanel === "friends"}
						onBeforeToggle={onBeforeToggle}
						showNotificationDot={hasFriendInSendouQ}
						badgeCount={unseenFriendRequests}
						badgeLeft={hasFriendInSendouQ}
					/>
					<MobileTab
						icon={<Calendar />}
						label={t("front:sideNav.myCalendar")}
						panelId={panelIds.tourneys}
						isActive={activePanel === "tourneys"}
						onBeforeToggle={onBeforeToggle}
					/>
					<MobileTab
						icon={<MessageSquare />}
						label={t("front:mobileNav.chat")}
						panelId={panelIds.chat}
						isActive={activePanel === "chat"}
						onBeforeToggle={onBeforeToggle}
						unreadCount={chatContext?.totalUnreadCount}
					/>
					<MobileTab
						icon={<User />}
						label={t("front:mobileNav.you")}
						panelId={panelIds.you}
						isActive={activePanel === "you"}
						onBeforeToggle={onBeforeToggle}
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
	panelId,
	isActive,
	onBeforeToggle,
	showNotificationDot,
	unreadCount,
	badgeCount,
	badgeLeft,
}: {
	icon: React.ReactNode;
	label: string;
	panelId: string;
	isActive: boolean;
	onBeforeToggle: () => void;
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
			popoverTarget={panelId}
			onPointerDown={onBeforeToggle}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") onBeforeToggle();
			}}
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

function PanelCloseButton({ panelId }: { panelId: string }) {
	const { t } = useTranslation(["common"]);

	return (
		<button
			type="button"
			className={styles.panelCloseButton}
			popoverTarget={panelId}
			popoverTargetAction="hide"
			aria-label={t("common:actions.close")}
		>
			<X size={18} />
		</button>
	);
}

function MobilePanel({
	id,
	title,
	icon,
	children,
	skipAnimation,
	onToggle,
}: {
	id: string;
	title: string;
	icon: React.ReactNode;
	children: React.ReactNode;
	skipAnimation: boolean;
	onToggle: PanelToggleHandler;
}) {
	const titleId = `${id}-title`;

	return (
		<div
			id={id}
			popover="auto"
			role="dialog"
			aria-labelledby={titleId}
			className={clsx(styles.panel, skipAnimation && styles.noAnimation)}
			onToggle={onToggle}
		>
			<div className={styles.panelDialog}>
				<header className={styles.panelHeader}>
					<div className={styles.panelIconContainer}>{icon}</div>
					<h2 id={titleId} className={styles.panelTitle}>
						{title}
					</h2>
					<PanelCloseButton panelId={id} />
				</header>
				<div className={clsx(styles.panelContent, "scrollbar")}>{children}</div>
			</div>
		</div>
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
								variant="outlined"
							>
								{t("common:pages.support")}
							</LinkButton>
						) : null}
						<ShareUrlButton
							variant="minimal"
							shape="square"
							url={`${SENDOU_INK_BASE_URL}${location.pathname}${location.search}`}
						/>
						<PanelCloseButton panelId={id} />
					</div>
				</header>

				<nav aria-label={t("front:mobileNav.menu")}>
					<ul className={styles.navGrid}>
						{navItems
							.filter(
								(item) => item.name !== "trophies" || canAccessTrophies(user),
							)
							.map((item) => (
								<li key={item.name}>
									<Link to={`/${item.url}`} className={styles.navItem}>
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
		<MobilePanel
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
			<Link to={FRIENDS_PAGE} className={styles.panelSectionLink}>
				{t("common:actions.viewAll")}
				<ChevronRight size={14} />
			</Link>
		</MobilePanel>
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
		<MobilePanel
			id={id}
			title={t("front:sideNav.myCalendar")}
			icon={<Calendar size={18} />}
			skipAnimation={skipAnimation}
			onToggle={onToggle}
		>
			{showScheduleNudge ? <ScheduleNudge panel /> : null}
			<EventsList events={events} />
			<Link to={EVENTS_PAGE} className={styles.panelSectionLink}>
				{t("common:actions.viewAll")}
				<ChevronRight size={14} />
			</Link>
		</MobilePanel>
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

	if (!user) {
		return null;
	}

	return (
		<MobilePanel
			id={id}
			title={t("front:mobileNav.you")}
			icon={<User size={18} />}
			skipAnimation={skipAnimation}
			onToggle={onToggle}
		>
			<div className={styles.youPanelUserRow}>
				<Link to={userPage(user)} className={styles.youPanelUser}>
					<Avatar user={user} size="sm" />
					<span className={styles.youPanelUsername}>{user.username}</span>
				</Link>
				<Link
					to={SETTINGS_PAGE}
					className={styles.youPanelSettingsButton}
					aria-label={t("common:pages.settings")}
				>
					<Settings size={18} />
				</Link>
			</div>

			{notifications ? (
				<NotificationContent
					notifications={notifications}
					unseenIds={unseenIds}
					isOpen={isOpen}
				/>
			) : null}
		</MobilePanel>
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
					<LazyChatSidebar onClose={() => panelRef.current?.hidePopover()} />
				) : null}
			</div>
		</div>
	);
}
