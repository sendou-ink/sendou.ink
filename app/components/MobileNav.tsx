import clsx from "clsx";
import { isToday, isTomorrow } from "date-fns";
import { Calendar, LogIn, Menu, Settings, User, Users, X } from "lucide-react";
import * as React from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { href, Link } from "react-router";
import { useUser } from "~/features/auth/core/user";
import type { loader as sidebarLoader } from "~/features/sidebar/routes/sidebar";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { mySlugify, navIconUrl, SETTINGS_PAGE, userPage } from "~/utils/urls";
import { Avatar } from "./Avatar";
import { SendouButton } from "./elements/Button";
import { Image, WeaponImage } from "./Image";
import { TwitchIcon } from "./icons/Twitch";
import { LogInButtonContainer } from "./layout/LogInButtonContainer";
import {
	NotificationContent,
	useNotifications,
} from "./layout/NotificationPopover";
import { navItems } from "./layout/nav-items";
import styles from "./MobileNav.module.css";
import { SideNavLink } from "./SideNav";

type SidebarData = Awaited<ReturnType<typeof sidebarLoader>> | undefined;
type PanelType = "closed" | "menu" | "friends" | "tourneys" | "you";

export function MobileNav({ sidebarData }: { sidebarData: SidebarData }) {
	const [activePanel, setActivePanel] = React.useState<PanelType>("closed");
	const user = useUser();
	const { unseenIds } = useNotifications();

	const hasActiveMatch = Boolean(sidebarData?.matchStatus);
	const hasTournamentMatch = Boolean(sidebarData?.tournamentMatchStatus);
	const hasUnseenNotifications = unseenIds.length > 0;

	const closePanel = () => setActivePanel("closed");

	return (
		<div className={styles.mobileNav}>
			{activePanel === "menu" ? (
				<MenuOverlay
					streams={sidebarData?.streams ?? []}
					onClose={closePanel}
				/>
			) : null}

			{activePanel === "friends" ? (
				<FriendsPanel
					friends={sidebarData?.friends ?? []}
					onClose={closePanel}
				/>
			) : null}

			{activePanel === "tourneys" ? (
				<TourneysPanel
					events={sidebarData?.events ?? []}
					onClose={closePanel}
				/>
			) : null}

			{activePanel === "you" ? <YouPanel onClose={closePanel} /> : null}

			<MobileTabBar
				activePanel={activePanel}
				onTabPress={setActivePanel}
				isLoggedIn={Boolean(user)}
				hasActiveMatch={hasActiveMatch}
				matchUrl={sidebarData?.matchStatus?.url}
				hasTournamentMatch={hasTournamentMatch}
				tournamentMatchStatus={sidebarData?.tournamentMatchStatus}
				hasUnseenNotifications={hasUnseenNotifications}
			/>
		</div>
	);
}

function MobileTabBar({
	activePanel,
	onTabPress,
	isLoggedIn,
	hasActiveMatch,
	matchUrl,
	hasTournamentMatch,
	tournamentMatchStatus,
	hasUnseenNotifications,
}: {
	activePanel: PanelType;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	hasActiveMatch: boolean;
	matchUrl?: string;
	hasTournamentMatch: boolean;
	tournamentMatchStatus?: NonNullable<SidebarData>["tournamentMatchStatus"];
	hasUnseenNotifications: boolean;
}) {
	const { t } = useTranslation(["front", "common"]);

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
					/>
					<MobileTab
						icon={<Calendar />}
						label={t("front:sideNav.myCalendar")}
						isActive={activePanel === "tourneys"}
						onPress={() => onTabPress("tourneys")}
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

			{hasActiveMatch && matchUrl ? (
				<Link to={matchUrl} className={styles.tab}>
					<span className={styles.tabIcon}>
						<Image path={navIconUrl("sendouq")} alt="" width={24} height={24} />
					</span>
					<span>{t("front:mobileNav.match")}</span>
				</Link>
			) : hasTournamentMatch && tournamentMatchStatus ? (
				<Link to={tournamentMatchStatus.url} className={styles.tab}>
					<span className={styles.tabIcon}>
						{tournamentMatchStatus.logoUrl ? (
							<img
								src={tournamentMatchStatus.logoUrl}
								alt=""
								width={24}
								height={24}
								className={styles.tournamentMatchIcon}
							/>
						) : null}
					</span>
					<span>{t("front:mobileNav.match")}</span>
				</Link>
			) : null}
		</nav>
	);
}

function MobileTab({
	icon,
	label,
	isActive,
	onPress,
	showNotificationDot,
}: {
	icon: React.ReactNode;
	label: string;
	isActive: boolean;
	onPress: () => void;
	showNotificationDot?: boolean;
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
				{showNotificationDot ? (
					<span className={styles.notificationDot}>
						<span className={styles.notificationDotPulse} />
					</span>
				) : null}
			</span>
			<span>{label}</span>
		</button>
	);
}

function MobilePanel({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	return (
		<ModalOverlay className={styles.panelOverlay} isOpen isDismissable={false}>
			<Modal className={clsx(styles.panel, "scrollbar")}>
				<Dialog className={styles.panelDialog}>
					<header className={styles.panelHeader}>
						<h2 className={styles.panelTitle}>{title}</h2>
						<SendouButton icon={<X />} variant="minimal" onPress={onClose} />
					</header>
					<div className={styles.panelContent}>{children}</div>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

function MenuOverlay({
	streams,
	onClose,
}: {
	streams: NonNullable<SidebarData>["streams"];
	onClose: () => void;
}) {
	const { t } = useTranslation(["front", "common", "weapons"]);

	const weaponIdToSlug = (weaponId: MainWeaponId) => {
		return mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));
	};

	return (
		<ModalOverlay className={styles.panelOverlay} isOpen isDismissable={false}>
			<Modal className={styles.menuOverlay}>
				<Dialog className={styles.panelDialog}>
					<header className={styles.menuHeader}>
						<h2 className={styles.menuTitle}>{t("front:mobileNav.menu")}</h2>
						<SendouButton icon={<X />} variant="minimal" onPress={onClose} />
					</header>

					<section className={styles.streamsSection}>
						<header className={styles.streamsSectionHeader}>
							<TwitchIcon />
							<h3>{t("front:sideNav.streams")}</h3>
						</header>
						<ul className={styles.streamsList}>
							{streams.map((stream) => (
								<li key={stream.id} className={styles.streamItem}>
									<img
										src={stream.imageUrl}
										alt=""
										className={styles.streamItemImage}
									/>
									<div className={styles.streamItemContent}>
										<span className={styles.streamItemName}>{stream.name}</span>
										<div className={styles.streamItemMeta}>
											{stream.subtitle ? (
												<span className={styles.streamItemSubtitle}>
													{stream.subtitle}
												</span>
											) : null}
											{stream.badge ? (
												<span className={styles.streamItemBadge}>
													{stream.badge}
												</span>
											) : null}
										</div>
									</div>
								</li>
							))}
						</ul>
					</section>

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

					<div className={styles.weaponsDivider} />

					<section className={styles.weaponsSection}>
						<h3 className={styles.weaponsSectionTitle}>
							{t("front:nav.weapons")}
						</h3>
						<div className={styles.weaponsContent}>
							{weaponCategories.map((category) => (
								<div key={category.name} className={styles.weaponCategory}>
									<div className={styles.weaponCategoryHeader}>
										{category.name}
									</div>
									<div className={styles.weaponGrid}>
										{category.weaponIds.map((weaponId) => (
											<Link
												key={weaponId}
												to={href("/weapons/:slug", {
													slug: weaponIdToSlug(weaponId),
												})}
												className={styles.weaponLink}
												title={t(`weapons:MAIN_${weaponId}`)}
												onClick={onClose}
											>
												<WeaponImage
													weaponSplId={weaponId as MainWeaponId}
													variant="build"
													size={32}
												/>
											</Link>
										))}
									</div>
								</div>
							))}
						</div>
					</section>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

function FriendsPanel({
	friends,
	onClose,
}: {
	friends: NonNullable<SidebarData>["friends"];
	onClose: () => void;
}) {
	const { t } = useTranslation(["front"]);

	return (
		<MobilePanel title={t("front:sideNav.friends")} onClose={onClose}>
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
		</MobilePanel>
	);
}

function TourneysPanel({
	events,
	onClose,
}: {
	events: NonNullable<SidebarData>["events"];
	onClose: () => void;
}) {
	const { t, i18n } = useTranslation(["front"]);

	const formatDayHeader = (date: Date) => {
		if (isToday(date)) {
			const rtf = new Intl.RelativeTimeFormat(i18n.language, {
				numeric: "auto",
			});
			const str = rtf.format(0, "day");
			return str.charAt(0).toUpperCase() + str.slice(1);
		}
		if (isTomorrow(date)) {
			const rtf = new Intl.RelativeTimeFormat(i18n.language, {
				numeric: "auto",
			});
			const str = rtf.format(1, "day");
			return str.charAt(0).toUpperCase() + str.slice(1);
		}
		return date.toLocaleDateString(i18n.language, {
			weekday: "long",
			month: "short",
			day: "numeric",
		});
	};

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString(i18n.language, {
			hour: "numeric",
			minute: "2-digit",
		});
	};

	const getDayKey = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		return date.toDateString();
	};

	const groupedEvents = events.reduce<Record<string, typeof events>>(
		(acc, event) => {
			const key = getDayKey(event.startTime);
			if (!acc[key]) {
				acc[key] = [];
			}
			acc[key].push(event);
			return acc;
		},
		{},
	);

	const dayKeys = Object.keys(groupedEvents);

	return (
		<MobilePanel title={t("front:sideNav.myCalendar")} onClose={onClose}>
			{events.length > 0 ? (
				dayKeys.map((dayKey) => {
					const dayEvents = groupedEvents[dayKey];
					const firstDate = new Date(dayEvents[0].startTime * 1000);

					return (
						<div key={dayKey}>
							<div className={styles.dayHeader}>
								{formatDayHeader(firstDate)}
							</div>
							{dayEvents.map((event) => (
								<SideNavLink
									key={`${event.type}-${event.id}`}
									to={event.url}
									imageUrl={event.logoUrl ?? undefined}
									subtitle={formatTime(new Date(event.startTime * 1000))}
									badge={
										event.scrimStatus === "booked"
											? t("front:sideNav.scrimBooked")
											: event.scrimStatus === "looking"
												? t("front:sideNav.scrimLooking")
												: undefined
									}
									badgeVariant={
										event.scrimStatus === "looking" ? "warning" : undefined
									}
									onClick={onClose}
								>
									{event.scrimStatus === "booked"
										? t("front:sideNav.scrimVs", { opponent: event.name })
										: event.name}
								</SideNavLink>
							))}
						</div>
					);
				})
			) : (
				<div className="text-lighter text-sm p-2">
					{t("front:sideNav.noEvents")}
				</div>
			)}
		</MobilePanel>
	);
}

function YouPanel({ onClose }: { onClose: () => void }) {
	const { t } = useTranslation(["front", "common"]);
	const user = useUser();
	const { notifications, unseenIds } = useNotifications();

	if (!user) {
		return null;
	}

	return (
		<MobilePanel title={t("front:mobileNav.you")} onClose={onClose}>
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
					<Settings />
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
