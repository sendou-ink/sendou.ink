import clsx from "clsx";
import { CircleCheck } from "lucide-react";
import type * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import { UserSearch } from "~/components/elements/UserSearch";
import { Image } from "~/components/Image";
import { useSearchParam } from "~/modules/search-params/hooks";
import { navIconUrl } from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import type { FeedPageData } from "../core/FeedPage.server";
import type { ScoreBreakdown } from "../core/FeedRanking";
import { FEED_CATEGORIES, FEED_ITEM_TYPES } from "../feed-constants";
import { feedSearchParams } from "../feed-search-params";
import { feedItemPage } from "../feed-urls";
import styles from "./Feed.module.css";
import { FeedItemCard } from "./FeedItemCard";
import { FeedSidebar } from "./FeedSidebar";

const TABS = [
	{ id: "ALL", label: "For you" },
	{ id: "FRIENDS", label: "Friends" },
] as const;

/** The viewer's feed with its filter tabs and the rotations sidebar. */
export function Feed({
	data,
	canViewAs = false,
	headerEnd,
	footer,
	scoreShown = false,
}: {
	data: FeedPageData;
	/** Dev only: lets the feed of any user be picked */
	canViewAs?: boolean;
	headerEnd?: React.ReactNode;
	footer?: React.ReactNode;
	/** Shows how each post's ranking score was calculated */
	scoreShown?: boolean;
}) {
	const [tabParam, setTabParam] = useSearchParam(feedSearchParams, "tab");
	const [viewAs] = useSearchParam(feedSearchParams, "viewAs");
	const filter = tabParam ?? "ALL";
	const setFilter = (id: typeof filter) =>
		setTabParam(id === "ALL" ? null : id, {
			replace: true,
			preventScrollReset: true,
		});

	const activity = data.activity.filter((item) => {
		const definition = FEED_ITEM_TYPES[item.type];
		if (filter === "ALL") return true;
		if (filter === "FRIENDS")
			return definition.audience.some((a) => a === "FRIENDS");

		return definition.category === filter;
	});

	const card = (item: FeedItem, score?: ScoreBreakdown) => (
		<FeedItemCard
			key={item.id}
			item={item}
			now={data.now}
			interactions={data.interactions[item.id]}
			sharerId={data.viewer.id}
			href={feedItemPage(item.id, { viewAs })}
			score={score}
		/>
	);

	return (
		<div className={styles.layout}>
			<div className={styles.feed}>
				<div className={styles.header}>
					<h1 className={styles.title}>Home</h1>
					{headerEnd}
				</div>
				{canViewAs ? <ViewAsPicker viewer={data.viewer} /> : null}
				<section className={styles.timeline}>
					<nav className={styles.tabs} aria-label="Filter feed">
						{TABS.map((tab) => (
							<button
								key={tab.id}
								type="button"
								className={clsx(styles.tab, {
									[styles.tabSelected]: filter === tab.id,
								})}
								aria-pressed={filter === tab.id}
								data-label={tab.label}
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
					{filter === "ALL" ? data.pinned.map((item) => card(item)) : null}
					{activity.map((item) =>
						card(item, scoreShown ? item.score : undefined),
					)}
					<div className={styles.caughtUp}>
						<CircleCheck size={32} className={styles.caughtUpIcon} />
						All caught up!
					</div>
				</section>
				{footer}
			</div>
			<FeedSidebar rotations={data.rotations} now={data.rotationsNow} />
		</div>
	);
}

function ViewAsPicker({ viewer }: { viewer: FeedPageData["viewer"] }) {
	const [viewAs, setViewAs] = useSearchParam(feedSearchParams, "viewAs");

	return (
		<div className={styles.viewAs}>
			<UserSearch
				key={viewAs ?? "self"}
				label="View the feed of"
				initialUserId={viewer.id}
				onChange={(user) => {
					if (user) setViewAs(user.id);
				}}
			/>
			{viewAs ? (
				<SendouButton
					size="small"
					variant="outlined"
					onClick={() => setViewAs(null)}
				>
					Back to own feed
				</SendouButton>
			) : null}
		</div>
	);
}
