import { Link, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Avatar } from "~/components/Avatar";
import { Button } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Divider } from "~/components/Divider";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Popover } from "~/components/Popover";
import { Table } from "~/components/Table";
import { MyForm } from "~/components/form/MyForm";
import { SpeechBubbleIcon } from "~/components/icons/SpeechBubble";
import { UsersIcon } from "~/components/icons/Users";
import { useIsMounted } from "~/hooks/useIsMounted";
import { joinListToNaturalString } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { userPage, userSubmittedImage } from "~/utils/urls";
import { Main } from "../../../components/Main";
import { FromFormField } from "../components/FromFormField";
import { newRequestSchema } from "../scrims-schemas";
import type { ScrimPost } from "../scrims-types";

import { action } from "../actions/scrims.server";
import { loader } from "../loaders/scrims.server";
export { loader, action };

import "../scrims.css";

export type NewRequestFormFields = z.infer<typeof newRequestSchema>;

export default function ScrimsPage() {
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();
	const [scrimToRequestId, setScrimToRequestId] = React.useState<number>();

	if (!isMounted)
		return (
			<Main>
				<div className="scrims__placeholder" />
			</Main>
		);

	// console.log(data);

	return (
		<Main>
			{typeof scrimToRequestId === "number" ? (
				<RequestScrimModal
					postId={scrimToRequestId}
					close={() => setScrimToRequestId(undefined)}
				/>
			) : null}
			<ScrimsDaySeparatedTables
				posts={data.posts}
				requestScrim={setScrimToRequestId}
			/>
		</Main>
	);
}

function RequestScrimModal({
	postId,
	close,
}: { postId: number; close: () => void }) {
	const data = useLoaderData<typeof loader>();

	const post = data.posts.find((post) => post.id === postId);
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
	requestScrim,
}: {
	posts: ScrimPost[];
	showPopovers?: boolean;
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
	showPopovers = true,
	requestScrim,
}: {
	posts: ScrimPost[];
	showPopovers?: boolean;
	requestScrim?: (postId: number) => void;
}) {
	const { i18n } = useTranslation();

	return (
		<Table>
			<thead>
				<tr>
					<th>Time</th>
					<th>Team</th>
					{showPopovers ? <th /> : null}
					<th>Divs</th>
					{requestScrim ? <th /> : null}
				</tr>
			</thead>
			<tbody>
				{posts.map((post) => {
					const owner =
						post.users.find((user) => user.isOwner) ?? post.users[0];

					const date = databaseTimestampToDate(post.at);
					const inThePast = date < new Date();

					return (
						<tr key={post.id}>
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
										<Button
											size="tiny"
											variant="destructive"
											onClick={() => requestScrim(post.id)}
										>
											Cancel
										</Button>
									</FormWithConfirm>
								</td>
							) : null}
						</tr>
					);
				})}
			</tbody>
		</Table>
	);
}
