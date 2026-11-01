import clsx from "clsx";
import * as React from "react";
import { useLoaderData } from "react-router";
import { SendouSwitch } from "~/components/elements/Switch";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl } from "~/utils/urls";
import { FeedItemCard } from "../components/FeedItemCard";
import { FeedSidebar } from "../components/FeedSidebar";
import {
	FEED_CATEGORIES,
	FEED_ITEM_TYPES,
	type FeedCategory,
} from "../feed-constants";
import { feedItemPage } from "../feed-urls";
import { loader } from "../loaders/feed-test.server";
import styles from "./feed-test.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["art", "builds", "gear"],
};

type Filter = "ALL" | "FRIENDS" | FeedCategory;

export default function FeedTestPage() {
	const data = useLoaderData<typeof loader>();
	const [filter, setFilter] = React.useState<Filter>("ALL");
	const [showRankingMath, setShowRankingMath] = React.useState(false);

	const activity = data.activity.filter((item) => {
		const definition = FEED_ITEM_TYPES[item.type];
		if (filter === "ALL") return true;
		if (filter === "FRIENDS")
			return definition.audience.some((a) => a === "FRIENDS");

		return definition.category === filter;
	});

	return (
		<Main bigger>
			<div className={styles.layout}>
				<div className={styles.feed}>
					<div className={styles.header}>
						<h1 className={styles.title}>Home</h1>
						<SendouSwitch
							isSelected={showRankingMath}
							onChange={setShowRankingMath}
							size="small"
						>
							Show ranking math
						</SendouSwitch>
					</div>
					<section className={styles.timeline}>
						<nav className={styles.tabs} aria-label="Filter feed">
							{(
								[
									{ id: "ALL", label: "For you" },
									{ id: "FRIENDS", label: "Friends" },
								] as const
							).map((tab) => (
								<button
									key={tab.id}
									type="button"
									className={clsx(styles.tab, {
										[styles.tabSelected]: filter === tab.id,
									})}
									aria-pressed={filter === tab.id}
									onClick={() => setFilter(tab.id)}
								>
									{tab.label}
								</button>
							))}
							{FEED_CATEGORIES.map((category) => (
								<button
									key={category.id}
									type="button"
									className={clsx(styles.tab, styles.tabIcon, {
										[styles.tabSelected]: filter === category.id,
									})}
									aria-pressed={filter === category.id}
									aria-label={category.label}
									title={category.label}
									onClick={() => setFilter(category.id)}
								>
									<Image path={navIconUrl(category.navIcon)} alt="" size={22} />
								</button>
							))}
						</nav>
						{/* xxx: going to a post and back should restore the scroll position in the feed */}
						{activity.map((item) => (
							<FeedItemCard
								key={item.type}
								item={item}
								now={data.now}
								commentCount={data.commentCounts[item.type] ?? 0}
								href={feedItemPage(item.type)}
								score={showRankingMath ? item.score : undefined}
							/>
						))}
					</section>
					<p className="text-xs text-lighter">
						Dev test page: every item type with matching rows in the database,
						seen as the logged in user with {data.friendCount} friends. Times
						are relative to shortly after the latest SendouQ match. For
						production data run the dev server with DB_PATH=db-sandbox.sqlite3
						and VITE_PROD_MODE=true.
					</p>
				</div>
				<FeedSidebar rotations={data.rotations} now={data.rotationsNow} />
			</div>
		</Main>
	);
}
