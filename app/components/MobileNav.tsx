import clsx from "clsx";
import { Calendar, LogIn, Menu, Settings, User, Users, X } from "lucide-react";
import * as React from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useUser } from "~/features/auth/core/user";
import type { loader as sidebarLoader } from "~/features/sidebar/routes/sidebar";
import { navIconUrl, SETTINGS_PAGE, userPage } from "~/utils/urls";
import { Avatar } from "./Avatar";
import { SendouButton } from "./elements/Button";
import { Image } from "./Image";
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

	const hasActiveMatch = Boolean(sidebarData?.matchStatus);
	const hasTournamentMatch = Boolean(sidebarData?.tournamentMatchStatus);

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
					tournaments={sidebarData?.tournaments ?? []}
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
}: {
	activePanel: PanelType;
	onTabPress: (panel: PanelType) => void;
	isLoggedIn: boolean;
	hasActiveMatch: boolean;
	matchUrl?: string;
	hasTournamentMatch: boolean;
	tournamentMatchStatus?: NonNullable<SidebarData>["tournamentMatchStatus"];
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
}: {
	icon: React.ReactNode;
	label: string;
	isActive: boolean;
	onPress: () => void;
}) {
	return (
		<button
			type="button"
			className={styles.tab}
			data-active={isActive}
			onClick={onPress}
		>
			<span className={styles.tabIcon}>{icon}</span>
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
	const { t } = useTranslation(["front", "common"]);

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
	tournaments,
	onClose,
}: {
	tournaments: NonNullable<SidebarData>["tournaments"];
	onClose: () => void;
}) {
	const { t } = useTranslation(["front"]);

	return (
		<MobilePanel title={t("front:sideNav.myCalendar")} onClose={onClose}>
			{tournaments.length > 0 ? (
				tournaments.map((tournament) => (
					<SideNavLink
						key={tournament.id}
						to={tournament.url}
						imageUrl={tournament.logoUrl ?? undefined}
						onClick={onClose}
					>
						{tournament.name}
					</SideNavLink>
				))
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
			<Link
				to={userPage(user)}
				className={styles.youPanelUser}
				onClick={onClose}
			>
				<Avatar user={user} size="sm" />
				<span className={styles.youPanelUsername}>{user.username}</span>
			</Link>

			{notifications ? (
				<NotificationContent
					notifications={notifications}
					unseenIds={unseenIds}
				/>
			) : null}

			<ul className={styles.youPanelActions}>
				<li>
					<Link
						to={SETTINGS_PAGE}
						className={styles.youPanelAction}
						onClick={onClose}
					>
						<Settings />
						<span>{t("common:pages.settings")}</span>
					</Link>
				</li>
			</ul>
		</MobilePanel>
	);
}
