import clsx from "clsx";
import { useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { href, Link } from "react-router";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { mySlugify, navIconUrl } from "~/utils/urls";
import { SendouPopover } from "../elements/Popover";
import { Image, WeaponImage } from "../Image";
import styles from "./TopNavMenus.module.css";

// xxx: placeholder categories
// xxx: make it so that you can view menu with one click, click -> move cursor to another menu item should show the items of that menu
const NAV_CATEGORIES = [
	{
		name: "competition",
		items: [
			{ name: "sendouq", url: "q" },
			{ name: "scrims", url: "scrims" },
			{ name: "lfg", url: "lfg" },
			{ name: "calendar", url: "calendar" },
			{ name: "plus", url: "plus/suggestions" },
		],
	},
	{
		name: "tools",
		items: [
			{ name: "analyzer", url: "analyzer" },
			{ name: "builds", url: "builds" },
			{ name: "object-damage-calculator", url: "object-damage-calculator" },
			{ name: "plans", url: "plans" },
			{ name: "tier-list-maker", url: "tier-list-maker" },
		],
	},
	{
		name: "community",
		items: [
			{ name: "badges", url: "badges" },
			{ name: "u", url: "u" },
			{ name: "t", url: "t" },
			{ name: "vods", url: "vods" },
			{ name: "art", url: "art" },
			{ name: "articles", url: "a" },
		],
	},
	{
		name: "more",
		items: [
			{ name: "leaderboards", url: "leaderboards" },
			{ name: "xsearch", url: "xsearch" },
			{ name: "maps", url: "maps" },
			{ name: "links", url: "links" },
		],
	},
] as const;

export function TopNavMenus() {
	return (
		<nav className={styles.container}>
			{NAV_CATEGORIES.map((category) => (
				<CategoryMenu key={category.name} category={category} />
			))}
			<WeaponsMenu />
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

	return (
		<SendouPopover
			trigger={
				<Button className={styles.menuButton}>
					{t(`front:nav.${category.name}`)}
				</Button>
			}
			popoverClassName={styles.menuPopover}
			placement="bottom start"
			isOpen={isOpen}
			onOpenChange={setIsOpen}
		>
			<div className={styles.menuContent}>
				{category.items.map((item) => (
					<Link
						key={item.url}
						to={`/${item.url}`}
						className={styles.menuItem}
						onClick={() => setIsOpen(false)}
					>
						<Image
							path={navIconUrl(item.name)}
							alt=""
							size={20}
							className={styles.menuItemIcon}
						/>
						{t(`common:pages.${item.name}`)}
					</Link>
				))}
			</div>
		</SendouPopover>
	);
}

function WeaponsMenu() {
	const { t } = useTranslation(["front", "weapons"]);
	const [isOpen, setIsOpen] = useState(false);

	const weaponIdToSlug = (weaponId: MainWeaponId) => {
		return mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));
	};

	return (
		<SendouPopover
			trigger={
				<Button className={styles.menuButton}>{t("front:nav.weapons")}</Button>
			}
			popoverClassName={clsx(styles.weaponsPopover, "scrollbar")}
			placement="bottom"
			isOpen={isOpen}
			onOpenChange={setIsOpen}
		>
			<div className={styles.weaponsContent}>
				{weaponCategories.map((category) => (
					<div key={category.name} className={styles.weaponCategory}>
						<div className={styles.weaponCategoryHeader}>{category.name}</div>
						<div className={styles.weaponGrid}>
							{category.weaponIds.map((weaponId) => (
								<Link
									key={weaponId}
									to={href("/weapons/:slug", {
										slug: weaponIdToSlug(weaponId),
									})}
									className={styles.weaponLink}
									title={t(`weapons:MAIN_${weaponId}`)}
									onClick={() => setIsOpen(false)}
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
		</SendouPopover>
	);
}
