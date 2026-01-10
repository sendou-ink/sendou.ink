import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import * as R from "remeda";
import type { z } from "zod";
import { AddNewButton } from "~/components/AddNewButton";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { useUser } from "~/features/auth/core/user";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	associationsPage,
	navIconUrl,
	newScrimPostPage,
	scrimsPage,
} from "~/utils/urls";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "../../../components/elements/Tabs";
import { Main } from "../../../components/Main";
import { action } from "../actions/scrims.server";
import { ScrimPostCard, ScrimRequestCard } from "../components/ScrimCard";
import { ScrimFiltersDialog } from "../components/ScrimFiltersDialog";
import * as Scrim from "../core/Scrim";
import { loader } from "../loaders/scrims.server";
import type { newRequestSchema } from "../scrims-schemas";
import type { ScrimFilters, ScrimPost } from "../scrims-types";
export { action, loader };

import { Check, Download, Funnel, Megaphone } from "lucide-react";

import styles from "./scrims.module.css";

export type NewRequestFormFields = z.infer<typeof newRequestSchema>;

export const handle: SendouRouteHandle = {
	i18n: ["calendar", "scrims"],
	breadcrumb: () => ({
		imgPath: navIconUrl("scrims"),
		href: scrimsPage(),
		type: "IMAGE",
	}),
};

export const meta: MetaFunction<typeof loader> = (args) => {
	return metaTags({
		title: "Scrims",
		ogTitle: "Splatoon scrim finder",
		description:
			"Schedule scrims against competitive teams. Make your own post or browse available scrims.",
		location: args.location,
	});
};

export default function ScrimsPage() {
	const user = useUser();
	const { t } = useTranslation(["calendar", "scrims"]);
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();

	if (!isMounted)
		return (
			<Main>
				<div className={styles.placeholder} />
			</Main>
		);

	return (
		<Main className="stack lg">
			<div className="stack horizontal justify-between items-center">
				<div className="stack horizontal sm">
					<LinkButton
						size="small"
						to={associationsPage()}
						className={clsx({ invisible: !user })}
						variant="outlined"
					>
						{t("scrims:associations.title")}
					</LinkButton>
					{user ? (
						<ScrimFiltersDialog
							key={JSON.stringify(data.filters)}
							filters={data.filters}
						/>
					) : null}
				</div>
				<AddNewButton to={newScrimPostPage()} navIcon="scrims" />
			</div>
			<SendouTabs
				defaultSelectedKey={
					data.posts.owned.length > 0
						? "owned"
						: data.posts.booked.length > 0
							? "booked"
							: "available"
				}
			>
				{user ? (
					<SendouTabList sticky>
						<SendouTab
							id="available"
							icon={<Megaphone />}
							number={data.posts.neutral.length}
							data-testid="available-scrims-tab"
						>
							{t("scrims:tabs.available")}
						</SendouTab>
						<SendouTab
							id="owned"
							isDisabled={!user}
							icon={<Download />}
							number={data.posts.owned.length}
						>
							{t("scrims:tabs.owned")}
						</SendouTab>
						<SendouTab
							id="booked"
							isDisabled={!user}
							icon={<Check />}
							number={data.posts.booked.length}
							data-testid="booked-scrims-tab"
						>
							{t("scrims:tabs.booked")}
						</SendouTab>
					</SendouTabList>
				) : null}
				<SendouTabPanel id="available">
					{data.posts.neutral.length > 0 ? (
						<ScrimsDaySeparatedCards
							posts={data.posts.neutral}
							filters={data.filters}
						/>
					) : (
						<div className="text-lighter text-lg font-semi-bold text-center mt-6">
							{t("scrims:noneAvailable")}
						</div>
					)}
				</SendouTabPanel>
				<SendouTabPanel id="owned">
					{data.posts.owned.length > 0 ? (
						<ScrimsDaySeparatedOwnedCards posts={data.posts.owned} />
					) : (
						<div className="text-lighter text-lg font-semi-bold text-center mt-6">
							{t("scrims:noOwnedPosts")}
						</div>
					)}
				</SendouTabPanel>
				<SendouTabPanel id="booked">
					{data.posts.booked.length > 0 ? (
						<ScrimsDaySeparatedBookedCards posts={data.posts.booked} />
					) : (
						<div className="text-lighter text-lg font-semi-bold text-center mt-6">
							{t("scrims:noBookedScrims")}
						</div>
					)}
				</SendouTabPanel>
			</SendouTabs>
			<div className="mt-6 text-xs text-center text-lighter">
				{t("calendar:inYourTimeZone")}{" "}
				{Intl.DateTimeFormat().resolvedOptions().timeZone}
			</div>
		</Main>
	);
}

function ScrimsDaySeparatedCards({
	posts,
	filters,
}: {
	posts: ScrimPost[];
	filters: ScrimFilters;
}) {
	const postsByDay = R.groupBy(posts, (post) =>
		databaseTimestampToDate(post.at).getDate(),
	);

	return (
		<div className="stack lg">
			{Object.entries(postsByDay)
				.sort((a, b) => a[1][0].at - b[1][0].at)
				.map(([day, dayPosts]) => (
					<ScrimsDaySection key={day} posts={dayPosts!} filters={filters} />
				))}
		</div>
	);
}

function ScrimsDaySection({
	posts,
	filters,
}: {
	posts: ScrimPost[];
	filters: ScrimFilters;
}) {
	const user = useUser();
	const [showFiltered, setShowFiltered] = React.useState(false);
	const [showRequestPending, setShowRequestPending] = React.useState(false);
	const { formatDate } = useTimeFormat();

	const filteredPosts = posts.filter((post) =>
		Scrim.applyFilters(post, filters),
	);

	const pendingRequestsCount = filteredPosts.filter((post) =>
		post.requests.some((request) =>
			request.users.some((rUser) => user?.id === rUser.id),
		),
	).length;

	return (
		<div className="stack md">
			<div className="stack xxs">
				<h2 className="text-sm">
					{formatDate(databaseTimestampToDate(posts[0].at), {
						day: "numeric",
						month: "long",
						weekday: "long",
					})}
				</h2>
				{user ? (
					<AvailableScrimsFilterButtons
						showFiltered={showFiltered}
						setShowFiltered={setShowFiltered}
						showRequestPending={showRequestPending}
						setShowRequestPending={setShowRequestPending}
						pendingRequestsCount={pendingRequestsCount}
						filteredCount={posts.length - filteredPosts.length}
					/>
				) : null}
			</div>
			<div className={styles.cardsGrid}>
				{(showFiltered ? posts : filteredPosts).map((post) => {
					const hasRequested = post.requests.some((request) =>
						request.users.some((rUser) => user?.id === rUser.id),
					);

					if (hasRequested && !showRequestPending) {
						return null;
					}

					const getAction = () => {
						if (!user) return undefined;
						if (hasRequested) return "VIEW_REQUEST";
						if (post.requests.length === 0) return "REQUEST";
						return undefined;
					};

					const isFilteredOut =
						showFiltered && !Scrim.applyFilters(post, filters);

					return (
						<ScrimPostCard
							key={post.id}
							post={post}
							action={getAction()}
							isFilteredOut={isFilteredOut}
						/>
					);
				})}
			</div>
		</div>
	);
}

function AvailableScrimsFilterButtons({
	showFiltered,
	setShowFiltered,
	showRequestPending,
	setShowRequestPending,
	pendingRequestsCount,
	filteredCount,
}: {
	showFiltered: boolean;
	setShowFiltered: (value: boolean) => void;
	showRequestPending: boolean;
	setShowRequestPending: (value: boolean) => void;
	pendingRequestsCount: number;
	filteredCount: number;
}) {
	const { t } = useTranslation(["scrims"]);

	if (filteredCount === 0 && pendingRequestsCount === 0) {
		return null;
	}

	return (
		<div className={styles.filterButtons}>
			{filteredCount > 0 ? (
				<SendouButton
					variant="minimal"
					size="miniscule"
					onPress={() => setShowFiltered(!showFiltered)}
					icon={<Funnel />}
					className={showFiltered ? styles.active : undefined}
				>
					{showFiltered
						? t("scrims:filters.hideFiltered", { count: filteredCount })
						: t("scrims:filters.showFiltered", { count: filteredCount })}
				</SendouButton>
			) : null}
			{pendingRequestsCount > 0 ? (
				<SendouButton
					variant="minimal"
					size="miniscule"
					onPress={() => setShowRequestPending(!showRequestPending)}
					icon={<Download />}
					className={showRequestPending ? styles.active : undefined}
					data-testid="toggle-pending-requests-button"
				>
					{showRequestPending
						? t("scrims:filters.hidePendingRequests", {
								count: pendingRequestsCount,
							})
						: t("scrims:filters.showPendingRequests", {
								count: pendingRequestsCount,
							})}
				</SendouButton>
			) : null}
		</div>
	);
}

function ScrimsDaySeparatedOwnedCards({ posts }: { posts: ScrimPost[] }) {
	const { t } = useTranslation(["scrims"]);
	const user = useUser();
	const { formatDate } = useTimeFormat();

	const postsByDay = R.groupBy(posts, (post) =>
		databaseTimestampToDate(post.at).getDate(),
	);

	return (
		<div className="stack lg">
			{Object.entries(postsByDay)
				.sort((a, b) => a[1][0].at - b[1][0].at)
				.map(([day, posts]) => {
					return (
						<div key={day} className="stack md">
							<h2 className="text-sm">
								{formatDate(databaseTimestampToDate(posts![0].at), {
									day: "numeric",
									month: "long",
									weekday: "long",
								})}
							</h2>
							<div className="stack lg">
								{posts!.map((post) => {
									const isAccepted = post.requests.some(
										(request) => request.isAccepted,
									);
									const canDelete =
										user &&
										post.permissions.DELETE_POST.includes(user.id) &&
										!isAccepted;

									return (
										<div key={post.id} className="stack sm">
											<ScrimPostCard
												post={post}
												action={canDelete ? "DELETE" : undefined}
											/>
											{post.requests.length > 0 ? (
												<div className="stack sm">
													{post.requests.map((request) => (
														<ScrimRequestCard
															key={request.id}
															request={request}
															postStartTime={post.at}
															canAccept={Boolean(
																user &&
																	post.permissions.MANAGE_REQUESTS.includes(
																		user.id,
																	),
															)}
														/>
													))}
												</div>
											) : (
												<div className="text-lighter text-lg font-bold mt-2 text-center">
													{t("scrims:noRequestsYet")}
												</div>
											)}
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
		</div>
	);
}

function ScrimsDaySeparatedBookedCards({ posts }: { posts: ScrimPost[] }) {
	const { formatDate } = useTimeFormat();

	const postsByDay = R.groupBy(posts, (post) =>
		databaseTimestampToDate(post.at).getDate(),
	);

	return (
		<div className="stack lg">
			{Object.entries(postsByDay)
				.sort((a, b) => a[1][0].at - b[1][0].at)
				.map(([day, posts]) => {
					return (
						<div key={day} className="stack md">
							<h2 className="text-sm">
								{formatDate(databaseTimestampToDate(posts![0].at), {
									day: "numeric",
									month: "long",
									weekday: "long",
								})}
							</h2>
							<div className="stack lg">
								{posts!.map((post) => {
									const acceptedRequest = post.requests.find(
										(request) => request.isAccepted,
									);

									return (
										<div key={post.id} className="stack sm">
											<ScrimPostCard post={post} action="CONTACT" />
											{acceptedRequest ? (
												<ScrimRequestCard
													request={acceptedRequest}
													postStartTime={post.at}
													canAccept={false}
													showFooter={false}
												/>
											) : null}
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
		</div>
	);
}
