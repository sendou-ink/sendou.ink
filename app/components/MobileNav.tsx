import clsx from "clsx";
import {
	Calendar,
	ChevronRight,
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
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { useChatContext } from "~/features/chat/useChatContext";
import { FriendMenu } from "~/features/friends/components/FriendMenu";
import { SENDOUQ_ACTIVITY_LABEL } from "~/features/friends/friends-constants";
import { useLayoutSize } from "~/hooks/useWindowSize";
import type { RootLoaderData } from "~/root";
import {
	EVENTS_PAGE,
	FRIENDS_PAGE,
	navIconUrl,
	SETTINGS_PAGE,
	userPage,
} from "~/utils/urls";
import { Avatar } from "./Avatar";
import { EventsList } from "./EventsList";
import { Image } from "./Image";
import { ChatSidebar } from "./layout/ChatSidebar";
import { LogInButtonContainer } from "./layout/LogInButtonContainer";
import {
	NotificationContent,
	useNotifications,
} from "./layout/NotificationPopover";
import { navItems } from "./layout/nav-items";
import styles from "./MobileNav.module.css";
import { NotificationDot } from "./NotificationDot";
import { StreamListItems } from "./StreamListItems";

type SidebarData = RootLoaderData["sidebar"] | undefined;
type PanelType = "closed" | "menu" | "friends" | "tourneys" | "chat" | "you";

export function MobileNav({ sidebarData }: { sidebarData: SidebarData }) {
	const [activePanel, setActivePanel] = React.useState<PanelType>("closed");
	const previousPanelRef = React.useRef<PanelType>("closed");
	const user = useUser();
	const { unseenIds } = useNotifications();
	const chatContext = useChatContext();
	const layoutSize = useLayoutSize();

	const hasUnseenNotifications = unseenIds.length > 0;
	const hasFriendInSendouQ =
		sidebarData?.friends.some((f) => f.subtitle === SENDOUQ_ACTIVITY_LABEL) ??
		false;

	const skipAnimation = previousPanelRef.current !== "closed";

	const closePanel = () => {
		previousPanelRef.current = activePanel;
		setActivePanel("closed");
	};

	const handleTabPress = (panel: PanelType) => {
		if (activePanel === panel) {
			if (panel === "chat") {
				chatContext?.setChatOpen(false);
			}
			previousPanelRef.current = activePanel;
			setActivePanel("closed");
			return;
		}

		if (activePanel === "chat") {
			chatContext?.setChatOpen(false);
		}

		if (panel === "chat") {
			chatContext?.setChatOpen(true);
		}

		previousPanelRef.current = activePanel;
		setActivePanel(panel);
	};

	const closeChatPanel = () => {
		chatContext?.setChatOpen(false);
		closePanel();
	};

	return (
		<div className={styles.mobileNav}>
			{activePanel === "menu" ? (
				<MenuOverlay
					streams={sidebarData?.streams ?? []}
					savedTournamentIds={sidebarData?.savedTournamentIds}
					onClose={closePanel}
					onTabPress={handleTabPress}
					isLoggedIn={Boolean(user)}
					skipAnimation={skipAnimation}
				/>
			) : null}

			{activePanel === "friends" ? (
				<FriendsPanel
					friends={sidebarData?.friends ?? []}
					onClose={closePanel}
					onTabPress={handleTabPress}
					isLoggedIn={Boolean(user)}
					skipAnimation={skipAnimation}
				/>
			) : null}

			{activePanel === "tourneys" ? (
				<TourneysPanel
					events={sidebarData?.events ?? []}
					onClose={closePanel}
					onTabPress={handleTabPress}
					isLoggedIn={Boolean(user)}
					skipAnimation={skipAnimation}
				/>
			) : null}

			{activePanel === "you" ? (
				<YouPanel
					onClose={closePanel}
					onTabPress={handleTabPress}
					isLoggedIn={Boolean(user)}
					skipAnimation={skipAnimation}
				/>
			) : null}

			{chatContext?.chatOpen && layoutSize === "mobile" ? (
				<ChatPanel
					onClose={closeChatPanel}
					onTabPress={handleTabPress}
					isLoggedIn={Boolean(user)}
					skipAnimation={skipAnimation}
				/>
			) : null}

			<MobileTabBar
				activePanel={activePanel}
				onTabPress={handleTabPress}
				isLoggedIn={Boolean(user)}
				hasUnseenNotifications={hasUnseenNotifications}
				hasFriendInSendouQ={hasFriendInSendouQ}
			/>
		</div>
	);
}

function MobileTabBar({
	activePanel,
	onTabPress,
	isLoggedIn,
	hasUnseenNotifications,
	hasFriendInSendouQ,
}: {
	activePanel: PanelType;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	hasUnseenNotifications: boolean;
	hasFriendInSendouQ: boolean;
}) {
	const { t } = useTranslation(["front", "common"]);
	const chatContext = useChatContext();

	return (
		<nav className={styles.tabBar}>
			<MobileTab
				icon={<Menu />}
				label={t("front:mobileNav.menu")}
				isActive={activePanel === "menu"}
				onPress={() => onTabPress("menu")}
			/>

			{isLoggedIn ? (
				<>
					<MobileTab
						icon={<Users />}
						label={t("front:mobileNav.friends")}
						isActive={activePanel === "friends"}
						onPress={() => onTabPress("friends")}
						showNotificationDot={hasFriendInSendouQ}
					/>
					<MobileTab
						icon={<Calendar />}
						label={t("front:sideNav.myCalendar")}
						isActive={activePanel === "tourneys"}
						onPress={() => onTabPress("tourneys")}
					/>
					<MobileTab
						icon={<MessageSquare />}
						label={t("front:mobileNav.chat")}
						isActive={activePanel === "chat"}
						onPress={() => onTabPress("chat")}
						unreadCount={chatContext?.totalUnreadCount}
					/>
					<MobileTab
						icon={<User />}
						label={t("front:mobileNav.you")}
						isActive={activePanel === "you"}
						onPress={() => onTabPress("you")}
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
	isActive,
	onPress,
	showNotificationDot,
	unreadCount,
}: {
	icon: React.ReactNode;
	label: string;
	isActive: boolean;
	onPress: () => void;
	showNotificationDot?: boolean;
	unreadCount?: number;
}) {
	return (
		<button
			type="button"
			className={styles.tab}
			data-active={isActive}
			onClick={onPress}
		>
			<span className={styles.tabIcon}>
				{icon}
				{showNotificationDot ? <NotificationDot /> : null}
				{unreadCount ? (
					<span className={styles.tabBadge}>{unreadCount}</span>
				) : null}
			</span>
			<span>{label}</span>
		</button>
	);
}

function MobilePanel({
	title,
	icon,
	onClose,
	children,
	onTabPress,
	isLoggedIn,
	skipAnimation,
}: {
	title: string;
	icon: React.ReactNode;
	onClose: () => void;
	children: React.ReactNode;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	skipAnimation: boolean;
}) {
	return (
		<ModalOverlay
			className={clsx(styles.panelOverlay, skipAnimation && styles.noAnimation)}
			isOpen
			isDismissable={false}
		>
			<Modal
				className={clsx(styles.panel, skipAnimation && styles.noAnimation)}
			>
				<Dialog className={styles.panelDialog}>
					<header className={styles.panelHeader}>
						<div className={styles.panelIconContainer}>{icon}</div>
						<h2 className={styles.panelTitle}>{title}</h2>
						<button
							type="button"
							className={styles.panelCloseButton}
							onClick={onClose}
						>
							<X size={18} />
						</button>
					</header>
					<div className={clsx(styles.panelContent, "scrollbar")}>
						{children}
					</div>
					<GhostTabBar onTabPress={onTabPress} isLoggedIn={isLoggedIn} />
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

function MenuOverlay({
	streams,
	savedTournamentIds,
	onClose,
	onTabPress,
	isLoggedIn,
	skipAnimation,
}: {
	streams: NonNullable<SidebarData>["streams"];
	savedTournamentIds?: number[];
	onClose: () => void;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	skipAnimation: boolean;
}) {
	const { t } = useTranslation(["front", "common"]);
	const user = useUser();

	return (
		<ModalOverlay
			className={clsx(styles.panelOverlay, skipAnimation && styles.noAnimation)}
			isOpen
			isDismissable={false}
		>
			<Modal
				className={clsx(
					styles.menuOverlay,
					"scrollbar",
					skipAnimation && styles.noAnimation,
				)}
			>
				<Dialog className={styles.panelDialog}>
					<header className={styles.menuHeader}>
						<div className={styles.panelIconContainer}>
							<Menu size={18} />
						</div>
						<h2 className={styles.panelTitle}>{t("front:mobileNav.menu")}</h2>
						<button
							type="button"
							className={styles.panelCloseButton}
							onClick={onClose}
						>
							<X size={18} />
						</button>
					</header>

					<nav aria-label={t("front:mobileNav.menu")}>
						<ul className={styles.navGrid}>
							{navItems.map((item) => (
								<li key={item.name}>
									<Link
										to={`/${item.url}`}
										className={styles.navItem}
										onClick={onClose}
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
							<h2 className={styles.panelTitle}>
								{t("front:sideNav.streams")}
							</h2>
						</header>
						{streams.length === 0 ? (
							<div className={styles.sideNavEmpty}>
								{t("front:sideNav.noStreams")}
							</div>
						) : null}
						<ul className={styles.streamsList}>
							<StreamListItems
								streams={streams}
								onClick={onClose}
								isLoggedIn={Boolean(user)}
								savedTournamentIds={savedTournamentIds}
							/>
						</ul>
					</section>
					<GhostTabBar onTabPress={onTabPress} isLoggedIn={isLoggedIn} />
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

function FriendsPanel({
	friends,
	onClose,
	onTabPress,
	isLoggedIn,
	skipAnimation,
}: {
	friends: NonNullable<SidebarData>["friends"];
	onClose: () => void;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	skipAnimation: boolean;
}) {
	const { t } = useTranslation(["front", "common"]);
	const user = useUser();

	return (
		<MobilePanel
			title={t("front:sideNav.friends")}
			icon={<Users size={18} />}
			onClose={onClose}
			onTabPress={onTabPress}
			isLoggedIn={isLoggedIn}
			skipAnimation={skipAnimation}
		>
			{friends.length > 0 ? (
				friends.map((friend) => (
					<FriendMenu key={friend.id} {...friend} onNavigate={onClose} />
				))
			) : (
				<div className={styles.sideNavEmpty}>
					{user
						? t("front:sideNav.friends.noFriends")
						: t("front:sideNav.friends.notLoggedIn")}
				</div>
			)}
			<Link
				to={FRIENDS_PAGE}
				className={styles.panelSectionLink}
				onClick={onClose}
			>
				{t("common:actions.viewAll")}
				<ChevronRight size={14} />
			</Link>
		</MobilePanel>
	);
}

function TourneysPanel({
	events,
	onClose,
	onTabPress,
	isLoggedIn,
	skipAnimation,
}: {
	events: NonNullable<SidebarData>["events"];
	onClose: () => void;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	skipAnimation: boolean;
}) {
	const { t } = useTranslation(["front", "common"]);

	return (
		<MobilePanel
			title={t("front:sideNav.myCalendar")}
			icon={<Calendar size={18} />}
			onClose={onClose}
			onTabPress={onTabPress}
			isLoggedIn={isLoggedIn}
			skipAnimation={skipAnimation}
		>
			<EventsList events={events} onClick={onClose} />
			<Link
				to={EVENTS_PAGE}
				className={styles.panelSectionLink}
				onClick={onClose}
			>
				{t("common:actions.viewAll")}
				<ChevronRight size={14} />
			</Link>
		</MobilePanel>
	);
}

function YouPanel({
	onClose,
	onTabPress,
	isLoggedIn,
	skipAnimation,
}: {
	onClose: () => void;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	skipAnimation: boolean;
}) {
	const { t } = useTranslation(["front", "common"]);
	const user = useUser();
	const { notifications, unseenIds } = useNotifications();

	if (!user) {
		return null;
	}

	return (
		<MobilePanel
			title={t("front:mobileNav.you")}
			icon={<User size={18} />}
			onClose={onClose}
			onTabPress={onTabPress}
			isLoggedIn={isLoggedIn}
			skipAnimation={skipAnimation}
		>
			<div className={styles.youPanelUserRow}>
				<Link
					to={userPage(user)}
					className={styles.youPanelUser}
					onClick={onClose}
				>
					<Avatar user={user} size="sm" />
					<span className={styles.youPanelUsername}>{user.username}</span>
				</Link>
				<Link
					to={SETTINGS_PAGE}
					className={styles.youPanelSettingsButton}
					onClick={onClose}
					aria-label={t("common:pages.settings")}
				>
					<Settings size={18} />
				</Link>
			</div>

			{notifications ? (
				<NotificationContent
					notifications={notifications}
					unseenIds={unseenIds}
					onClose={onClose}
				/>
			) : null}
		</MobilePanel>
	);
}

function ChatPanel({
	onClose,
	onTabPress,
	isLoggedIn,
	skipAnimation,
}: {
	onClose: () => void;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	skipAnimation: boolean;
}) {
	return (
		<ModalOverlay
			className={clsx(styles.panelOverlay, skipAnimation && styles.noAnimation)}
			isOpen
			isDismissable={false}
		>
			<Modal
				className={clsx(
					styles.panel,
					"scrollbar",
					skipAnimation && styles.noAnimation,
				)}
			>
				<Dialog className={styles.panelDialog}>
					<ChatSidebar onClose={onClose} />
					<GhostTabBar onTabPress={onTabPress} isLoggedIn={isLoggedIn} />
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

const LOGGED_IN_TABS: PanelType[] = [
	"menu",
	"friends",
	"tourneys",
	"chat",
	"you",
];
const LOGGED_OUT_TABS: PanelType[] = ["menu"];

function GhostTabBar({
	onTabPress,
	isLoggedIn,
}: {
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
}) {
	const tabs = isLoggedIn ? LOGGED_IN_TABS : LOGGED_OUT_TABS;

	return (
		<div className={styles.ghostTabBar} aria-hidden="true">
			{tabs.map((tab) => (
				<button
					key={tab}
					type="button"
					className={styles.ghostTab}
					tabIndex={-1}
					onClick={() => onTabPress(tab)}
				/>
			))}
		</div>
	);
}
