import type { MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import type { z } from "zod/v4";
import { AddNewButton } from "~/components/AddNewButton";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { useUser } from "~/features/auth/core/user";
import { useIsMounted } from "~/hooks/useIsMounted";
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
import { ArrowDownOnSquareIcon } from "../../../components/icons/ArrowDownOnSquare";
import { CheckmarkIcon } from "../../../components/icons/Checkmark";
import { FilterIcon } from "../../../components/icons/Filter";
import { MegaphoneIcon } from "../../../components/icons/MegaphoneIcon";
import { Main } from "../../../components/Main";
import { action } from "../actions/scrims.server";
import { ScrimPostCard, ScrimRequestCard } from "../components/ScrimCard";
import { loader } from "../loaders/scrims.server";
import type { newRequestSchema } from "../scrims-schemas";
import type { ScrimPost } from "../scrims-types";
export { action, loader };

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

// xxx: add filters
// xxx: possibly just hide tabs when not logged in instead of disabling tabs
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
				<LinkButton
					size="small"
					to={associationsPage()}
					className={clsx("mr-auto", { invisible: !user })}
					variant="outlined"
				>
					{t("scrims:associations.title")}
				</LinkButton>
				<AddNewButton to={newScrimPostPage()} navIcon="scrims" />
			</div>
			<SendouTabs
				defaultSelectedKey={data.posts.owned.length > 0 ? "owned" : "available"}
			>
				<SendouTabList sticky>
					<SendouTab
						id="available"
						icon={<MegaphoneIcon />}
						number={data.posts.neutral.length}
						data-testid="available-scrims-tab"
					>
						{t("scrims:tabs.available")}
					</SendouTab>
					<SendouTab
						id="owned"
						isDisabled={!user}
						icon={<ArrowDownOnSquareIcon />}
						number={data.posts.owned.length}
					>
						{t("scrims:tabs.owned")}
					</SendouTab>
					<SendouTab
						id="booked"
						isDisabled={!user}
						icon={<CheckmarkIcon />}
						number={data.posts.booked.length}
						data-testid="booked-scrims-tab"
					>
						{t("scrims:tabs.booked")}
					</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="available">
					{data.posts.neutral.length > 0 ? (
						<ScrimsDaySeparatedCards posts={data.posts.neutral} />
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

function ScrimsDaySeparatedCards({ posts }: { posts: ScrimPost[] }) {
	const postsByDay = R.groupBy(posts, (post) =>
		databaseTimestampToDate(post.at).getDate(),
	);

	return (
		<div className="stack lg">
			{Object.entries(postsByDay)
				.sort((a, b) => a[1][0].at - b[1][0].at)
				.map(([day, dayPosts]) => (
					<ScrimsDaySection key={day} posts={dayPosts!} />
				))}
		</div>
	);
}

function ScrimsDaySection({ posts }: { posts: ScrimPost[] }) {
	const { i18n } = useTranslation();
	const user = useUser();
	const [showFiltered, setShowFiltered] = React.useState(false);
	const [showRequestPending, setShowRequestPending] = React.useState(false);

	const pendingRequestsCount = posts.filter((post) =>
		post.requests.some((request) =>
			request.users.some((rUser) => user?.id === rUser.id),
		),
	).length;

	return (
		<div className="stack md">
			<div className="stack xxs">
				<h2 className="text-sm">
					{databaseTimestampToDate(posts[0].at).toLocaleDateString(
						i18n.language,
						{
							day: "numeric",
							month: "long",
							weekday: "long",
						},
					)}
				</h2>
				{user ? (
					<AvailableScrimsFilterButtons
						showFiltered={showFiltered}
						setShowFiltered={setShowFiltered}
						showRequestPending={showRequestPending}
						setShowRequestPending={setShowRequestPending}
						pendingRequestsCount={pendingRequestsCount}
					/>
				) : null}
			</div>
			<div className={styles.cardsGrid}>
				{posts.map((post) => {
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

					return (
						<ScrimPostCard key={post.id} post={post} action={getAction()} />
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
}: {
	showFiltered: boolean;
	setShowFiltered: (value: boolean) => void;
	showRequestPending: boolean;
	setShowRequestPending: (value: boolean) => void;
	pendingRequestsCount: number;
}) {
	const { t } = useTranslation(["scrims"]);

	return (
		<div className={styles.filterButtons}>
			<SendouButton
				variant="minimal"
				size="miniscule"
				onPress={() => setShowFiltered(!showFiltered)}
				icon={<FilterIcon />}
				className={showFiltered ? styles.active : undefined}
			>
				{showFiltered
					? t("scrims:filters.hideFiltered", { count: 0 })
					: t("scrims:filters.showFiltered", { count: 0 })}
			</SendouButton>
			{pendingRequestsCount > 0 ? (
				<SendouButton
					variant="minimal"
					size="miniscule"
					onPress={() => setShowRequestPending(!showRequestPending)}
					icon={<ArrowDownOnSquareIcon />}
					className={showRequestPending ? styles.active : undefined}
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
	const { i18n, t } = useTranslation(["scrims"]);
	const user = useUser();

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
								{databaseTimestampToDate(posts![0].at).toLocaleDateString(
									i18n.language,
									{
										day: "numeric",
										month: "long",
										weekday: "long",
									},
								)}
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
	const { i18n } = useTranslation();

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
								{databaseTimestampToDate(posts![0].at).toLocaleDateString(
									i18n.language,
									{
										day: "numeric",
										month: "long",
										weekday: "long",
									},
								)}
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
