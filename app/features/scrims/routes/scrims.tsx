import type { MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import type { z } from "zod";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { Divider } from "~/components/Divider";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Table } from "~/components/Table";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouForm } from "~/components/form/SendouForm";
import { EyeSlashIcon } from "~/components/icons/EyeSlash";
import { SpeechBubbleIcon } from "~/components/icons/SpeechBubble";
import { UsersIcon } from "~/components/icons/Users";
import { useUser } from "~/features/auth/core/user";
import { useIsMounted } from "~/hooks/useIsMounted";
import { joinListToNaturalString, nullFilledArray } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	associationsPage,
	scrimPage,
	userPage,
	userSubmittedImage,
} from "~/utils/urls";
import { Main } from "../../../components/Main";
import { NewTabs } from "../../../components/NewTabs";
import { ArrowDownOnSquareIcon } from "../../../components/icons/ArrowDownOnSquare";
import { ArrowUpOnSquareIcon } from "../../../components/icons/ArrowUpOnSquare";
import { CheckmarkIcon } from "../../../components/icons/Checkmark";
import { ClockIcon } from "../../../components/icons/Clock";
import { CrossIcon } from "../../../components/icons/Cross";
import { MegaphoneIcon } from "../../../components/icons/MegaphoneIcon";
import { SpeechBubbleFilledIcon } from "../../../components/icons/SpeechBubbleFilled";
import { WithFormField } from "../components/WithFormField";
import { SCRIM } from "../scrims-constants";
import { newRequestSchema } from "../scrims-schemas";
import type { ScrimPost, ScrimPostRequest } from "../scrims-types";

import { action } from "../actions/scrims.server";
import { loader } from "../loaders/scrims.server";
export { loader, action };

import styles from "./scrims.module.css";

export type NewRequestFormFields = z.infer<typeof newRequestSchema>;

export const handle: SendouRouteHandle = {
	i18n: ["calendar", "scrims"],
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
		<Main className="stack lg">
			{user ? (
				<LinkButton
					size="tiny"
					to={associationsPage()}
					className="mr-auto"
					variant="outlined"
				>
					{t("scrims:associations.title")}
				</LinkButton>
			) : null}
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
						label: t("scrims:tabs.owned"),
						number: data.posts.owned.length,
						disabled: !user,
						icon: <ArrowDownOnSquareIcon />,
					},
					{
						label: t("scrims:tabs.requests"),
						number: data.posts.requested.length,
						disabled: !user,
						icon: <ArrowUpOnSquareIcon />,
					},
					{
						label: t("scrims:tabs.available"),
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
									{t("scrims:noneAvailable")}
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
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();

	// both to avoid crash when requesting
	const post = [...data.posts.neutral, ...data.posts.requested].find(
		(post) => post.id === postId,
	);
	invariant(post, "Post not found");

	return (
		<SendouDialog heading={t("scrims:requestModal.title")} onClose={close}>
			<SendouForm
				schema={newRequestSchema}
				defaultValues={{
					_action: "NEW_REQUEST",
					scrimPostId: postId,
					from:
						data.teams.length > 0
							? { mode: "TEAM", teamId: data.teams[0].id }
							: {
									mode: "PICKUP",
									users: nullFilledArray(
										SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER,
									) as unknown as number[],
								},
				}}
			>
				<ScrimsDaySeparatedTables posts={[post]} showPopovers={false} />
				<div className="font-semi-bold text-lighter italic">
					{joinListToNaturalString(post.users.map((u) => u.username))}
				</div>
				{post.text ? (
					<div className="text-sm text-lighter italic">{post.text}</div>
				) : null}
				<Divider />
				<WithFormField usersTeams={data.teams} />
			</SendouForm>
		</SendouDialog>
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
	const { t } = useTranslation(["common", "scrims"]);
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
					<th>{t("scrims:table.headers.time")}</th>
					<th>{t("scrims:table.headers.team")}</th>
					{showPopovers ? <th /> : null}
					<th>{t("scrims:table.headers.divs")}</th>
					{showStatus ? <th>{t("scrims:table.headers.status")}</th> : null}
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
									canAccept={Boolean(
										user && post.permissions.MANAGE_REQUESTS.includes(user.id),
									)}
									request={request}
									postId={post.id}
								/>
							))
						: [];

					const isAccepted = post.requests.some(
						(request) => request.isAccepted,
					);

					const showContactButton =
						isAccepted &&
						post.requests.at(0)?.users.some((rUser) => rUser.id === user?.id);

					const status = getStatus(post);

					return (
						<React.Fragment key={post.id}>
							<tr>
								<td>
									<div className="stack horizontal sm">
										<div className={styles.postTime}>
											{inThePast
												? t("scrims:now")
												: databaseTimestampToDate(post.at).toLocaleTimeString(
														i18n.language,
														{
															hour: "numeric",
															minute: "numeric",
														},
													)}
										</div>
										{post.isPrivate ? (
											<SendouPopover
												trigger={
													<SendouButton
														variant="minimal"
														icon={<EyeSlashIcon className={styles.postIcon} />}
														data-testid="limited-visibility-popover"
													/>
												}
											>
												{t("scrims:limitedVisibility")}
											</SendouPopover>
										) : null}
									</div>
								</td>
								<td>
									<div className="stack horizontal sm items-center min-w-max">
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
										{post.team?.name ??
											t("scrims:pickup", { username: owner.username })}
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
														data-testid="scrim-text-popover"
													/>
												}
											>
												{post.text}
											</SendouPopover>
										) : null}
									</td>
								) : null}
								<td className="whitespace-nowrap">
									{post.divs ? (
										<>
											{post.divs.max} - {post.divs.min}
										</>
									) : null}
								</td>
								{showStatus ? (
									<td
										className={clsx({
											[styles.postFloatingActionCell]: status !== "CONFIRMED",
										})}
									>
										<div
											className={clsx(styles.postStatus, {
												[styles.postStatusConfirmed]: status === "CONFIRMED",
												[styles.postStatusPending]: status === "PENDING",
											})}
										>
											{status === "CONFIRMED" ? (
												<>
													<CheckmarkIcon /> {t("scrims:status.booked")}
												</>
											) : null}
											{status === "PENDING" ? (
												<>
													<ClockIcon /> {t("scrims:status.pending")}
												</>
											) : null}
										</div>
									</td>
								) : null}
								{user && requestScrim && post.requests.length === 0 ? (
									<td className={styles.postFloatingActionCell}>
										<Button
											size="tiny"
											onClick={() => requestScrim(post.id)}
											icon={<ArrowUpOnSquareIcon />}
											className="ml-auto"
										>
											{t("scrims:actions.request")}
										</Button>
									</td>
								) : null}
								{showDeletePost && !isAccepted ? (
									<td>
										{user && post.permissions.DELETE_POST.includes(user.id) ? (
											<FormWithConfirm
												dialogHeading={t("scrims:deleteModal.title")}
												submitButtonText={t("common:actions.delete")}
												fields={[
													["scrimPostId", post.id],
													["_action", "DELETE_POST"],
												]}
											>
												<Button
													size="tiny"
													variant="destructive"
													className="ml-auto"
												>
													{t("common:actions.delete")}
												</Button>
											</FormWithConfirm>
										) : (
											<SendouPopover
												trigger={
													<SendouButton
														variant="destructive"
														size="small"
														className="ml-auto"
													>
														{t("common:actions.delete")}
													</SendouButton>
												}
											>
												{t("scrims:deleteModal.prevented")}
											</SendouPopover>
										)}
									</td>
								) : null}
								{user &&
								requestScrim &&
								post.requests.length !== 0 &&
								!post.requests.at(0)?.isAccepted &&
								post.requests.at(0)?.permissions.CANCEL.includes(user.id) ? (
									<td>
										<FormWithConfirm
											dialogHeading={t("scrims:cancelModal.title")}
											submitButtonText={t("common:actions.cancel")}
											fields={[
												["scrimPostRequestId", post.requests[0].id],
												["_action", "CANCEL_REQUEST"],
											]}
										>
											<Button
												size="tiny"
												variant="destructive"
												icon={<CrossIcon />}
												className="ml-auto"
											>
												{t("common:actions.cancel")}
											</Button>
										</FormWithConfirm>
									</td>
								) : null}
								{showContactButton ? (
									<td className={styles.postFloatingActionCell}>
										<ContactButton postId={post.id} />
									</td>
								) : null}
								{isAccepted &&
								post.requests.some(
									(r) =>
										r.isAccepted && !r.users.some((u) => u.id === user?.id),
								) ? (
									<td />
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
	const { t } = useTranslation(["scrims"]);

	return (
		<LinkButton
			to={scrimPage(postId)}
			size="tiny"
			className="w-max ml-auto"
			icon={<SpeechBubbleFilledIcon />}
		>
			{t("scrims:actions.contact")}
		</LinkButton>
	);
}

function RequestRow({
	canAccept,
	request,
	postId,
}: { canAccept: boolean; request: ScrimPostRequest; postId: number }) {
	const { t } = useTranslation(["common", "scrims"]);

	const requestOwner =
		request.users.find((user) => user.isOwner) ?? request.users[0];

	const groupName =
		request.team?.name ??
		t("scrims:pickup", {
			username: requestOwner.username,
		});

	return (
		<tr className="bg-theme-transparent-important">
			<td />
			<td>
				<div className="stack horizontal sm items-center">
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
					{groupName}
				</div>
			</td>
			<td />
			<td />
			<td className={styles.postFloatingActionCell}>
				{!request.isAccepted && canAccept ? (
					<FormWithConfirm
						dialogHeading={t("scrims:acceptModal.title", { groupName })}
						fields={[
							["scrimPostRequestId", request.id],
							["_action", "ACCEPT_REQUEST"],
						]}
						submitButtonVariant="primary"
						submitButtonText={t("common:actions.accept")}
					>
						<Button size="tiny" className="ml-auto">
							{t("common:actions.accept")}
						</Button>
					</FormWithConfirm>
				) : !request.isAccepted && !canAccept ? (
					<SendouPopover
						trigger={
							<SendouButton size="small" className="ml-auto">
								{t("common:actions.accept")}
							</SendouButton>
						}
					>
						{t("scrims:acceptModal.prevented")}
					</SendouPopover>
				) : (
					<ContactButton postId={postId} />
				)}
			</td>
		</tr>
	);
}
