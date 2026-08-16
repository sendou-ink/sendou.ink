import clsx from "clsx";
import { type LinkProps, NavLink } from "react-router";
import { Image } from "~/components/Image";
import { navIconUrl } from "~/utils/urls";
import styles from "./UserPageIconNav.module.css";

export interface UserPageNavItem {
	to: string;
	iconName: string;
	label: string;
	count?: number;
	isVisible: boolean;
	testId?: string;
	end?: boolean;
	prefetch?: LinkProps["prefetch"];
}

export function UserPageIconNav({ items }: { items: UserPageNavItem[] }) {
	const visibleItems = items.filter((item) => item.isVisible);

	return (
		<nav className={styles.iconNav}>
			{visibleItems.map((item) => (
				<NavLink
					key={item.to}
					to={item.to}
					end={item.end ?? true}
					prefetch={item.prefetch}
					data-testid={item.testId}
					className={(state) =>
						clsx(styles.iconNavItem, {
							[styles.active]: state.isActive,
						})
					}
					aria-label={
						item.count !== undefined
							? `${item.label} (${item.count})`
							: item.label
					}
				>
					<Image
						path={navIconUrl(item.iconName)}
						width={24}
						height={24}
						alt=""
					/>
				</NavLink>
			))}
		</nav>
	);
}
