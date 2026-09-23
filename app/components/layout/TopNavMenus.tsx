import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { type PointerEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useLocation } from "react-router";
import { Config } from "~/config";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { useUser } from "~/features/auth/core/user";
import { canAccessTrophies } from "~/features/trophies/trophies-utils";
import {
	impersonateUrl,
	navIconUrl,
	STOP_IMPERSONATING_URL,
} from "~/utils/urls";
import { SendouPopover } from "../elements/Popover";
import { Image } from "../Image";
import styles from "./TopNavMenus.module.css";

const DEV_IMPERSONATE_ITEMS = [
	{ name: "Sendou", icon: "sendou_love", action: impersonateUrl(ADMIN_ID) },
	{ name: "N-ZAP", icon: "u", action: impersonateUrl(NZAP_TEST_ID) },
	{ name: "Logged out", icon: "log_in", action: STOP_IMPERSONATING_URL },
] as const;

const DEV_LINK_ITEMS = [
	{ name: "Components", icon: "settings", url: "/components" },
	{ name: "OG Images", icon: "art", url: "/admin/og-images" },
] as const;

const NAV_CATEGORIES = [
	{
		name: "play",
		items: [
			{ name: "sendouq", url: "q" },
			{ name: "scrims", url: "scrims" },
			{ name: "lfg", url: "lfg" },
			{ name: "calendar", url: "calendar" },
			{ name: "leaderboards", url: "leaderboards" },
			...(Config.showLutiNavItem
				? [{ name: "luti" as const, url: "luti" as const }]
				: []),
		],
	},
	{
		name: "tools",
		items: [
			{ name: "analyzer", url: "analyzer" },
			{ name: "comp-analyzer", url: "comp-analyzer" },
			{ name: "object-damage-calculator", url: "object-damage-calculator" },
			{ name: "plans", url: "plans" },
			{ name: "maps", url: "maps" },
			{ name: "tier-list-maker", url: "tier-list-maker" },
			{ name: "xsearch", url: "xsearch" },
			{ name: "scanner", url: "scanner" },
			{
				name: "admin",
				url: "admin",
				icon: "settings" as const,
				staffOnly: true as const,
			},
		],
	},
	{
		name: "community",
		items: [
			{ name: "builds", url: "builds" },
			{ name: "art", url: "art" },
			{ name: "articles", url: "a" },
			{ name: "vods", url: "vods" },
			{ name: "trophies", url: "trophies" },
			{ name: "links", url: "links" },
			{ name: "plus", url: "plus/suggestions" },
		],
	},
] as const;

interface MenuOpenState {
	isOpen: boolean;
	anotherIsOpen: boolean;
	onOpenChange: (open: boolean) => void;
}

export function TopNavMenus() {
	const [openMenu, setOpenMenu] = useState<string | null>(null);

	const openStateOf = (name: string): MenuOpenState => ({
		isOpen: openMenu === name,
		anotherIsOpen: openMenu !== null && openMenu !== name,
		onOpenChange: (open) =>
			setOpenMenu((current) => {
				if (open) return name;
				return current === name ? null : current;
			}),
	});

	return (
		<nav className={styles.container}>
			{NAV_CATEGORIES.map((category) => (
				<CategoryMenu
					key={category.name}
					category={category}
					openState={openStateOf(category.name)}
				/>
			))}
			{process.env.NODE_ENV === "development" ? (
				<DevMenu openState={openStateOf("dev")} />
			) : null}
		</nav>
	);
}

function takeOverOnHover(openState: MenuOpenState, event: PointerEvent) {
	if (openState.anotherIsOpen && event.pointerType !== "touch") {
		openState.onOpenChange(true);
	}
}

function DevMenu({ openState }: { openState: MenuOpenState }) {
	const [isPreviewSuppressed, setIsPreviewSuppressed] = useState(false);
	const location = useLocation();
	const returnTo = `${location.pathname}${location.search}`;

	return (
		<div className={styles.menuWrapper}>
			<SendouPopover
				trigger={
					<button
						type="button"
						className={styles.menuButton}
						onPointerEnter={(event) => {
							setIsPreviewSuppressed(false);
							takeOverOnHover(openState, event);
						}}
					>
						Dev
						<ChevronDown className={styles.menuButtonChevron} />
					</button>
				}
				popoverClassName={styles.menuPopover}
				placement="bottom start"
				isOpen={openState.isOpen}
				onOpenChange={openState.onOpenChange}
				eager
			>
				<div className={styles.menuContent}>
					{DEV_IMPERSONATE_ITEMS.map((item) => (
						<Form
							key={item.name}
							className={styles.menuItemForm}
							method="post"
							action={item.action}
							reloadDocument
						>
							<input type="hidden" name="returnTo" value={returnTo} />
							<button
								type="submit"
								className={clsx(styles.menuItem, styles.menuItemButton)}
							>
								<Image
									path={navIconUrl(item.icon)}
									alt=""
									size={20}
									className={styles.menuItemIcon}
								/>
								{item.name}
							</button>
						</Form>
					))}
					{DEV_LINK_ITEMS.map((item) => (
						<Link
							key={item.name}
							to={item.url}
							className={styles.menuItem}
							onClick={() => {
								openState.onOpenChange(false);
								setIsPreviewSuppressed(true);
							}}
						>
							<Image
								path={navIconUrl(item.icon)}
								alt=""
								size={20}
								className={styles.menuItemIcon}
							/>
							{item.name}
						</Link>
					))}
				</div>
			</SendouPopover>
			{!openState.isOpen && !isPreviewSuppressed ? (
				<div className={styles.preview}>
					{DEV_IMPERSONATE_ITEMS.map((item) => (
						<Form
							key={item.name}
							className={styles.menuItemForm}
							method="post"
							action={item.action}
							reloadDocument
						>
							<input type="hidden" name="returnTo" value={returnTo} />
							<button
								type="submit"
								className={clsx(styles.previewIcon, styles.previewIconButton)}
								title={item.name}
								aria-label={item.name}
								tabIndex={-1}
							>
								<Image path={navIconUrl(item.icon)} alt="" size={20} />
							</button>
						</Form>
					))}
					{DEV_LINK_ITEMS.map((item) => (
						<Link
							key={item.name}
							to={item.url}
							className={styles.previewIcon}
							title={item.name}
							aria-label={item.name}
							tabIndex={-1}
							onClick={() => setIsPreviewSuppressed(true)}
						>
							<Image path={navIconUrl(item.icon)} alt="" size={20} />
						</Link>
					))}
				</div>
			) : null}
		</div>
	);
}

function CategoryMenu({
	category,
	openState,
}: {
	category: (typeof NAV_CATEGORIES)[number];
	openState: MenuOpenState;
}) {
	const { t } = useTranslation(["common", "front"]);
	const [isPreviewSuppressed, setIsPreviewSuppressed] = useState(false);
	const user = useUser();
	const isStaff = user?.roles.includes("STAFF") ?? false;
	const showStaffOnly = isStaff || process.env.NODE_ENV === "development";

	const visibleItems = category.items.filter((item) => {
		if ("staffOnly" in item && !showStaffOnly) return false;
		if (item.name === "trophies" && !canAccessTrophies(user)) return false;
		return true;
	});

	return (
		<div className={styles.menuWrapper}>
			<SendouPopover
				trigger={
					<button
						type="button"
						className={styles.menuButton}
						onPointerEnter={(event) => {
							setIsPreviewSuppressed(false);
							takeOverOnHover(openState, event);
						}}
					>
						{t(`front:nav.${category.name}`)}
						<ChevronDown className={styles.menuButtonChevron} />
					</button>
				}
				popoverClassName={styles.menuPopover}
				placement="bottom start"
				isOpen={openState.isOpen}
				onOpenChange={openState.onOpenChange}
				eager
			>
				<div className={styles.menuContent}>
					{visibleItems.map((item) => (
						<Link
							key={item.url}
							to={`/${item.url}`}
							prefetch="intent"
							className={styles.menuItem}
							onClick={() => {
								openState.onOpenChange(false);
								setIsPreviewSuppressed(true);
							}}
						>
							<Image
								path={navIconUrl("icon" in item ? item.icon : item.name)}
								alt=""
								size={20}
								className={styles.menuItemIcon}
							/>
							{t(`common:pages.${item.name}`)}
						</Link>
					))}
				</div>
			</SendouPopover>
			{!openState.isOpen && !isPreviewSuppressed ? (
				<div className={styles.preview}>
					{visibleItems.map((item) => (
						<Link
							key={item.url}
							to={`/${item.url}`}
							prefetch="intent"
							className={styles.previewIcon}
							title={t(`common:pages.${item.name}`)}
							aria-label={t(`common:pages.${item.name}`)}
							tabIndex={-1}
							onClick={() => setIsPreviewSuppressed(true)}
						>
							<Image
								path={navIconUrl("icon" in item ? item.icon : item.name)}
								alt=""
								size={20}
							/>
						</Link>
					))}
				</div>
			) : null}
		</div>
	);
}
