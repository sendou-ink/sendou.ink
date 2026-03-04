import { useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { navIconUrl } from "~/utils/urls";
import { SendouPopover } from "../elements/Popover";
import { Image } from "../Image";
import styles from "./TopNavMenus.module.css";

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
			{ name: "comp-analyzer", url: "comp-analyzer" },
			{ name: "object-damage-calculator", url: "object-damage-calculator" },
			{ name: "plans", url: "plans" },
			{ name: "tier-list-maker", url: "tier-list-maker" },
		],
	},
	{
		name: "community",
		items: [
			{ name: "builds", url: "builds" },
			{ name: "badges", url: "badges" },
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
