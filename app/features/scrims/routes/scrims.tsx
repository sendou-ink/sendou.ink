import type { MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import type { z } from "zod/v4";
import { AddNewButton } from "~/components/AddNewButton";
import { LinkButton } from "~/components/elements/Button";
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
						id="owned"
						isDisabled={!user}
						icon={<ArrowDownOnSquareIcon />}
						number={data.posts.owned.length}
					>
						{t("scrims:tabs.owned")}
					</SendouTab>
					<SendouTab
						id="available"
						icon={<MegaphoneIcon />}
						number={data.posts.neutral.length}
						data-testid="available-scrims-tab"
					>
						{t("scrims:tabs.available")}
					</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="owned">
					{data.posts.owned.length > 0 ? (
						<ScrimsDaySeparatedOwnedCards posts={data.posts.owned} />
					) : (
						<div className="text-lighter text-lg font-semi-bold text-center mt-6">
							{t("scrims:noOwnedPosts")}
						</div>
					)}
				</SendouTabPanel>
				<SendouTabPanel id="available">
					{data.posts.neutral.length > 0 ? (
						<ScrimsDaySeparatedCards posts={data.posts.neutral} />
					) : (
						<div className="text-lighter text-lg font-semi-bold text-center mt-6">
							{t("scrims:noneAvailable")}
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
	const { i18n } = useTranslation();
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
							<div className={styles.cardsGrid}>
								{posts!.map((post) => {
									const hasRequested = post.requests.some((request) =>
										request.users.some((rUser) => user?.id === rUser.id),
									);

									const getAction = () => {
										if (!user) return undefined;
										if (hasRequested) return "VIEW_REQUEST";
										if (post.requests.length === 0) return "REQUEST";
										return undefined;
									};

									return (
										<ScrimPostCard
											key={post.id}
											post={post}
											action={getAction()}
										/>
									);
								})}
							</div>
						</div>
					);
				})}
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
