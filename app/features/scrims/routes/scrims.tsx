import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Divider } from "~/components/Divider";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Popover } from "~/components/Popover";
import { SubmitButton } from "~/components/SubmitButton";
import { Table } from "~/components/Table";
import { MyForm } from "~/components/form/MyForm";
import { SpeechBubbleIcon } from "~/components/icons/SpeechBubble";
import { UsersIcon } from "~/components/icons/Users";
import { useUser } from "~/features/auth/core/user";
import { useIsMounted } from "~/hooks/useIsMounted";
import { joinListToNaturalString } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { scrimPage, userPage, userSubmittedImage } from "~/utils/urls";
import { Main } from "../../../components/Main";
import { NewTabs } from "../../../components/NewTabs";
import { FromFormField } from "../components/FromFormField";
import { newRequestSchema } from "../scrims-schemas";
import type { ScrimPost, ScrimPostRequest } from "../scrims-types";

import { action } from "../actions/scrims.server";
import { loader } from "../loaders/scrims.server";
export { loader, action };

import "../scrims.css";

export type NewRequestFormFields = z.infer<typeof newRequestSchema>;

export const handle: SendouRouteHandle = {
	i18n: "calendar",
};

// xxx: default should not be empty "Own posts" tab
// xxx: mobile better (button visible always)

export default function ScrimsPage() {
	const { t } = useTranslation(["calendar"]);
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();
	const [scrimToRequestId, setScrimToRequestId] = React.useState<number>();

	// biome-ignore lint/correctness/useExhaustiveDependencies: clear modal on submit
	React.useEffect(() => {
		setScrimToRequestId(undefined);
	}, [data]);

	if (!isMounted)
		return (
			<Main>
				<div className="scrims__placeholder" />
			</Main>
		);

	return (
		<Main>
			{typeof scrimToRequestId === "number" ? (
				<RequestScrimModal
					postId={scrimToRequestId}
					close={() => setScrimToRequestId(undefined)}
				/>
			) : null}
			<NewTabs
				sticky
				disappearing
				tabs={[
					{
						label: "Own posts",
						number: data.posts.owned.length,
					},
					{
						label: "Requests sent",
						number: data.posts.requested.length,
					},
					{
						label: "Available",
						number: data.posts.neutral.length,
					},
				]}
				content={[
					{
						key: "owned",
						element: (
							<ScrimsDaySeparatedTables
								posts={data.posts.owned}
								showDeletePost
								showRequestRows
							/>
						),
					},
					{
						key: "requested",
						element: (
							<ScrimsDaySeparatedTables
								posts={data.posts.requested}
								requestScrim={setScrimToRequestId}
							/>
						),
					},
					{
						key: "available",
						element:
							data.posts.neutral.length > 0 ? (
								<ScrimsDaySeparatedTables
									posts={data.posts.neutral}
									requestScrim={setScrimToRequestId}
								/>
							) : (
								<div className="text-lighter text-lg font-semi-bold text-center mt-6">
									No scrims available right now. Check back later or add your
									own!
								</div>
							),
					},
				]}
			/>
			<div className="mt-6 text-xs text-center text-lighter">
				{t("calendar:inYourTimeZone")}{" "}
				{Intl.DateTimeFormat().resolvedOptions().timeZone}
			</div>
		</Main>
	);
}

function RequestScrimModal({
	postId,
	close,
}: { postId: number; close: () => void }) {
	const data = useLoaderData<typeof loader>();

	// both to avoid crash when requesting
	const post = [...data.posts.neutral, ...data.posts.requested].find(
		(post) => post.id === postId,
	);
	invariant(post, "Post not found");

	return (
		<Dialog isOpen>
			<MyForm
				schema={newRequestSchema}
				title="Sending a scrim request"
				defaultValues={{
					_action: "NEW_REQUEST",
					scrimPostId: postId,
					from:
						data.teams.length > 0
							? { mode: "TEAM", teamId: data.teams[0].id }
							: {
									mode: "PICKUP",
									users: [],
								},
				}}
				handleCancel={close}
			>
				<ScrimsDaySeparatedTables posts={[post]} showPopovers={false} />
				<div className="font-semi-bold text-lighter italic">
					{joinListToNaturalString(post.users.map((u) => u.username))}
				</div>
				{post.text ? (
					<div className="text-sm text-lighter italic">{post.text}</div>
				) : null}
				<Divider />
				<FromFormField usersTeams={data.teams} />
			</MyForm>
		</Dialog>
	);
}

function ScrimsDaySeparatedTables({
	posts,
	showPopovers = true,
	showDeletePost = false,
	showRequestRows = false,
	requestScrim,
}: {
	posts: ScrimPost[];
	showPopovers?: boolean;
	showDeletePost?: boolean;
	showRequestRows?: boolean;
	requestScrim?: (postId: number) => void;
}) {
	const { i18n } = useTranslation();

	// xxx: make sure it compiles to other browsers
	const postsByDay = Object.groupBy(posts, (post) =>
		databaseTimestampToDate(post.at).getDate(),
	);

	return (
		<div className="stack lg">
			{Object.entries(postsByDay).map(([day, posts]) => {
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
						<ScrimsTable
							posts={posts!}
							requestScrim={requestScrim}
							showDeletePost={showDeletePost}
							showRequestRows={showRequestRows}
							showPopovers={showPopovers}
						/>
					</div>
				);
			})}
		</div>
	);
}

function ScrimsTable({
	posts,
	showPopovers,
	showDeletePost,
	showRequestRows,
	requestScrim,
}: {
	posts: ScrimPost[];
	showPopovers: boolean;
	showDeletePost: boolean;
	showRequestRows: boolean;
	requestScrim?: (postId: number) => void;
}) {
	const user = useUser();
	const { i18n } = useTranslation();

	invariant(
		!(requestScrim && showDeletePost),
		"Can't have both request scrim and delete post",
	);

	return (
		<Table>
			<thead>
				<tr>
					<th>Time</th>
					<th>Team</th>
					{showPopovers ? <th /> : null}
					<th>Divs</th>
					{requestScrim || showDeletePost ? <th /> : null}
				</tr>
			</thead>
			<tbody>
				{posts.map((post) => {
					const owner =
						post.users.find((user) => user.isOwner) ?? post.users[0];

					const date = databaseTimestampToDate(post.at);
					const inThePast = date < new Date();

					const requests = showRequestRows
						? post.requests.map((request) => (
								<RequestRow key={request.id} request={request} />
							))
						: [];

					const isAccepted = post.requests.some(
						(request) => request.isAccepted,
					);

					return (
						<React.Fragment key={post.id}>
							<tr>
								<td>
									<div className="scrims__post__time">
										{inThePast
											? "Now"
											: databaseTimestampToDate(post.at).toLocaleTimeString(
													i18n.language,
													{
														hour: "numeric",
														minute: "numeric",
													},
												)}
									</div>
								</td>
								<td>
									<div className="stack horizontal md items-center">
										{showPopovers ? (
											<Popover
												buttonChildren={
													<UsersIcon className="scrims__post__icon" />
												}
											>
												<div className="stack md">
													{post.users.map((user) => (
														<Link
															to={userPage(user)}
															key={user.id}
															className="stack horizontal sm"
														>
															<Avatar size="xxs" user={user} />
															{user.username}
														</Link>
													))}
												</div>
											</Popover>
										) : null}
										{post.team?.avatarUrl ? (
											<Avatar
												size="xxs"
												url={userSubmittedImage(post.team.avatarUrl)}
											/>
										) : (
											<Avatar size="xxs" user={owner} />
										)}
										{post.team?.name ?? `${owner.username}'s pickup`}
									</div>
								</td>
								{showPopovers ? (
									<td>
										{post.text ? (
											<Popover
												buttonChildren={
													<SpeechBubbleIcon className="scrims__post__icon" />
												}
											>
												{post.text}
											</Popover>
										) : null}
									</td>
								) : null}
								<td>
									{post.divs ? (
										<>
											{post.divs.max} - {post.divs.min}
										</>
									) : null}
								</td>
								{requestScrim && post.requests.length === 0 ? (
									<td>
										<Button size="tiny" onClick={() => requestScrim(post.id)}>
											Book
										</Button>
									</td>
								) : null}
								{showDeletePost && !isAccepted ? (
									<td>
										{owner.id === user?.id ? (
											<FormWithConfirm
												dialogHeading="Delete scrim post"
												deleteButtonText="Delete"
												cancelButtonText="Nevermind"
												fields={[
													["scrimPostId", post.id],
													["_action", "DELETE_POST"],
												]}
											>
												<Button size="tiny" variant="destructive">
													Delete
												</Button>
											</FormWithConfirm>
										) : (
											<Popover
												buttonChildren={<>Delete</>}
												triggerClassName="destructive tiny"
											>
												The post must be deleted by the owner ({owner.username})
											</Popover>
										)}
									</td>
								) : null}
								{requestScrim && post.requests.length !== 0 ? (
									<td>
										<FormWithConfirm
											dialogHeading="Cancel request"
											deleteButtonText="Cancel"
											cancelButtonText="Nevermind"
											fields={[
												["scrimPostRequestId", post.requests[0].id],
												["_action", "CANCEL_REQUEST"],
											]}
										>
											<Button size="tiny" variant="destructive">
												Cancel
											</Button>
										</FormWithConfirm>
									</td>
								) : null}
								{isAccepted ? (
									<td>
										<LinkButton to={scrimPage(post.id)} size="tiny">
											View
										</LinkButton>
									</td>
								) : null}
							</tr>
							{requests}
						</React.Fragment>
					);
				})}
			</tbody>
		</Table>
	);
}

function RequestRow({ request }: { request: ScrimPostRequest }) {
	const fetcher = useFetcher();

	const owner = request.users.find((user) => user.isOwner) ?? request.users[0];

	return (
		<tr className="bg-theme-transparent-important">
			<td />
			<td>
				<div className="stack horizontal md items-center">
					<Popover
						buttonChildren={<UsersIcon className="scrims__post__icon" />}
					>
						<div className="stack md">
							{request.users.map((user) => (
								<Link
									to={userPage(user)}
									key={user.id}
									className="stack horizontal sm"
								>
									<Avatar size="xxs" user={user} />
									{user.username}
								</Link>
							))}
						</div>
					</Popover>
					{request.team?.avatarUrl ? (
						<Avatar
							size="xxs"
							url={userSubmittedImage(request.team.avatarUrl)}
						/>
					) : (
						<Avatar size="xxs" user={owner} />
					)}
					{request.team?.name ?? `${owner.username}'s pickup`}
				</div>
			</td>
			<td />
			<td />
			<td>
				{/** xxx: some kind of confirm? */}
				{!request.isAccepted ? (
					<fetcher.Form method="post">
						<input type="hidden" name="scrimPostRequestId" value={request.id} />
						<SubmitButton
							_action="ACCEPT_REQUEST"
							state={fetcher.state}
							size="tiny"
						>
							Accept
						</SubmitButton>
					</fetcher.Form>
				) : null}
			</td>
		</tr>
	);
}
