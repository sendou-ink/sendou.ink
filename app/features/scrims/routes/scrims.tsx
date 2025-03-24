import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import groupBy from "just-group-by";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Divider } from "~/components/Divider";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { SubmitButton } from "~/components/SubmitButton";
import { Table } from "~/components/Table";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
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
import { ArrowDownOnSquareIcon } from "../../../components/icons/ArrowDownOnSquare";
import { ArrowUpOnSquareIcon } from "../../../components/icons/ArrowUpOnSquare";
import { CheckmarkIcon } from "../../../components/icons/Checkmark";
import { ClockIcon } from "../../../components/icons/Clock";
import { CrossIcon } from "../../../components/icons/Cross";
import { MegaphoneIcon } from "../../../components/icons/MegaphoneIcon";
import { SpeechBubbleFilledIcon } from "../../../components/icons/SpeechBubbleFilled";
import { FromFormField } from "../components/FromFormField";
import { newRequestSchema } from "../scrims-schemas";
import type { ScrimPost, ScrimPostRequest } from "../scrims-types";

import { action } from "../actions/scrims.server";
import { loader } from "../loaders/scrims.server";
export { loader, action };

import styles from "./scrims.module.css";

export type NewRequestFormFields = z.infer<typeof newRequestSchema>;

export const handle: SendouRouteHandle = {
	i18n: "calendar",
};

// xxx: mobile better (button visible always)
// xxx: notifications

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
				<div className={styles.placeholder} />
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
				defaultIndex={data.posts.owned.length > 0 ? 0 : 2}
				tabs={[
					{
						label: "Own posts",
						number: data.posts.owned.length,
						icon: <ArrowDownOnSquareIcon />,
					},
					{
						label: "Requests",
						number: data.posts.requested.length,
						icon: <ArrowUpOnSquareIcon />,
					},
					{
						label: "Available",
						number: data.posts.neutral.length,
						icon: <MegaphoneIcon />,
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
								showStatus
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
	showStatus = false,
	requestScrim,
}: {
	posts: ScrimPost[];
	showPopovers?: boolean;
	showDeletePost?: boolean;
	showRequestRows?: boolean;
	showStatus?: boolean;
	requestScrim?: (postId: number) => void;
}) {
	const { i18n } = useTranslation();

	const postsByDay = groupBy(posts, (post) =>
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
							showStatus={showStatus}
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
	showStatus,
	requestScrim,
}: {
	posts: ScrimPost[];
	showPopovers: boolean;
	showDeletePost: boolean;
	showRequestRows: boolean;
	showStatus: boolean;
	requestScrim?: (postId: number) => void;
}) {
	const user = useUser();
	const { i18n } = useTranslation();

	invariant(
		!(requestScrim && showDeletePost),
		"Can't have both request scrim and delete post",
	);

	const getStatus = (post: ScrimPost) => {
		if (post.requests.at(0)?.isAccepted) return "CONFIRMED";
		if (
			post.requests.some((r) => r.users.some((rUser) => user?.id === rUser.id))
		) {
			return "PENDING";
		}

		return null;
	};

	return (
		<Table>
			<thead>
				<tr>
					<th>Time</th>
					<th>Team</th>
					{showPopovers ? <th /> : null}
					<th>Divs</th>
					{showStatus ? <th>Status</th> : null}
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
								<RequestRow
									key={request.id}
									canAccept={owner.id === user?.id}
									request={request}
									postId={post.id}
								/>
							))
						: [];

					const isAccepted = post.requests.some(
						(request) => request.isAccepted,
					);

					const status = getStatus(post);

					return (
						<React.Fragment key={post.id}>
							<tr>
								<td>
									<div className={styles.postTime}>
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
											<SendouPopover
												trigger={
													<SendouButton
														variant="minimal"
														icon={<UsersIcon className={styles.postIcon} />}
													/>
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
											</SendouPopover>
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
											<SendouPopover
												trigger={
													<SendouButton
														variant="minimal"
														icon={
															<SpeechBubbleIcon className={styles.postIcon} />
														}
													/>
												}
											>
												{post.text}
											</SendouPopover>
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
								{showStatus ? (
									<td>
										<div
											className={clsx(styles.postStatus, {
												[styles.postStatusConfirmed]: status === "CONFIRMED",
												[styles.postStatusPending]: status === "PENDING",
											})}
										>
											{status === "CONFIRMED" ? (
												<>
													<CheckmarkIcon /> Booked
												</>
											) : null}
											{status === "PENDING" ? (
												<>
													<ClockIcon /> Pending
												</>
											) : null}
										</div>
									</td>
								) : null}
								{requestScrim && post.requests.length === 0 ? (
									<td>
										<Button
											size="tiny"
											onClick={() => requestScrim(post.id)}
											icon={<ArrowUpOnSquareIcon />}
										>
											Request
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
											<SendouPopover
												trigger={
													<SendouButton variant="destructive" size="small">
														Delete
													</SendouButton>
												}
											>
												The post must be deleted by the owner ({owner.username})
											</SendouPopover>
										)}
									</td>
								) : null}
								{requestScrim &&
								post.requests.length !== 0 &&
								!post.requests.at(0)?.isAccepted ? (
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
											<Button
												size="tiny"
												variant="destructive"
												icon={<CrossIcon />}
											>
												Cancel
											</Button>
										</FormWithConfirm>
									</td>
								) : null}
								{isAccepted &&
								post.requests
									.at(0)
									?.users.some((rUser) => rUser.id === user?.id) ? (
									<td>
										<ContactButton postId={post.id} />
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

function ContactButton({ postId }: { postId: number }) {
	return (
		<LinkButton
			to={scrimPage(postId)}
			size="tiny"
			className="w-max"
			icon={<SpeechBubbleFilledIcon />}
		>
			Contact
		</LinkButton>
	);
}

function RequestRow({
	canAccept,
	request,
	postId,
}: { canAccept: boolean; request: ScrimPostRequest; postId: number }) {
	const fetcher = useFetcher();

	const requestOwner =
		request.users.find((user) => user.isOwner) ?? request.users[0];

	return (
		<tr className="bg-theme-transparent-important">
			<td />
			<td>
				<div className="stack horizontal md items-center">
					<SendouPopover
						trigger={
							<SendouButton
								icon={<UsersIcon className={styles.postIcon} />}
								variant="minimal"
							/>
						}
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
					</SendouPopover>
					{request.team?.avatarUrl ? (
						<Avatar
							size="xxs"
							url={userSubmittedImage(request.team.avatarUrl)}
						/>
					) : (
						<Avatar size="xxs" user={requestOwner} />
					)}
					{request.team?.name ?? `${requestOwner.username}'s pickup`}
				</div>
			</td>
			<td />
			<td />
			<td>
				{/** xxx: some kind of confirm? */}
				{!request.isAccepted && canAccept ? (
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
				) : !request.isAccepted && !canAccept ? (
					<SendouPopover
						trigger={<SendouButton size="small">Accept</SendouButton>}
					>
						Ask the person who posted the scrim to accept this request
					</SendouPopover>
				) : (
					<ContactButton postId={postId} />
				)}
			</td>
		</tr>
	);
}
