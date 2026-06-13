import { useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { navIconUrl } from "~/utils/urls";
import { SendouPopover } from "../elements/Popover";
import { Image } from "../Image";
import styles from "./TopNavMenus.module.css";

const NAV_CATEGORIES = [
	{
		name: "play",
		items: [
			{ name: "sendouq", url: "q" },
			{ name: "scrims", url: "scrims" },
			{ name: "lfg", url: "lfg" },
			{ name: "calendar", url: "calendar" },
			{ name: "leaderboards", url: "leaderboards" },
			...(import.meta.env.VITE_SHOW_LUTI_NAV_ITEM === "true"
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

export function TopNavMenus() {
	return (
		<nav className={styles.container}>
			{NAV_CATEGORIES.map((category) => (
				<CategoryMenu key={category.name} category={category} />
			))}
		</nav>
	);
}

function CategoryMenu({
	category,
}: {
	category: (typeof NAV_CATEGORIES)[number];
}) {
	const { t } = useTranslation(["common", "front"]);
	const [isOpen, setIsOpen] = useState(false);
	const [isPreviewSuppressed, setIsPreviewSuppressed] = useState(false);
	const user = useUser();
	const isStaff = user?.roles.includes("STAFF") ?? false;
	const showStaffOnly = isStaff || process.env.NODE_ENV === "development";

	const visibleItems = category.items.filter(
		(item) => !("staffOnly" in item) || showStaffOnly,
	);

	return (
		<div className={styles.menuWrapper}>
			<SendouPopover
				trigger={
					<Button
						className={styles.menuButton}
						onHoverStart={() => setIsPreviewSuppressed(false)}
					>
						{t(`front:nav.${category.name}`)}
					</Button>
				}
				popoverClassName={styles.menuPopover}
				placement="bottom start"
				isOpen={isOpen}
				onOpenChange={setIsOpen}
			>
				<div className={styles.menuContent}>
					{visibleItems.map((item) => (
						<Link
							key={item.url}
							to={`/${item.url}`}
							className={styles.menuItem}
							onClick={() => {
								setIsOpen(false);
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
			{!isOpen && !isPreviewSuppressed ? (
				<div className={styles.preview}>
					{visibleItems.map((item) => (
						<Link
							key={item.url}
							to={`/${item.url}`}
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
