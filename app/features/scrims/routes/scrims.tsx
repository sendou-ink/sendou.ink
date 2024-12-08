import { Link, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Avatar } from "~/components/Avatar";
import { Button } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { Divider } from "~/components/Divider";
import { Popover } from "~/components/Popover";
import { Table } from "~/components/Table";
import { MyForm } from "~/components/form/MyForm";
import { SpeechBubbleIcon } from "~/components/icons/SpeechBubble";
import { UsersIcon } from "~/components/icons/Users";
import { useIsMounted } from "~/hooks/useIsMounted";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { userPage, userSubmittedImage } from "~/utils/urls";
import { Main } from "../../../components/Main";
import { newRequestSchema } from "../scrims-schemas";
import type { ScrimPost } from "../scrims-types";
import { FromFormField } from "../components/FromFormField";

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
				<RequestScrimModal postId={scrimToRequestId} />
			) : null}
			<ScrimsDaySeparatedTables
				posts={data.posts}
				requestScrim={setScrimToRequestId}
				showText={false}
			/>
		</Main>
	);
}

function RequestScrimModal({ postId }: { postId: number }) {
	const data = useLoaderData<typeof loader>();

	const post = data.posts.find((post) => post.id === postId);
	invariant(post, "Post not found");

	return (
		<Dialog isOpen closeOnAnyClick>
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
			>
				<ScrimsDaySeparatedTables posts={[post]} />
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
	showText = true,
	requestScrim,
}: {
	posts: ScrimPost[];
	showText?: boolean;
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
							showText={showText}
						/>
					</div>
				);
			})}
		</div>
	);
}

function ScrimsTable({
	posts,
	showText = true,
	requestScrim,
}: {
	posts: ScrimPost[];
	showText?: boolean;
	requestScrim?: (postId: number) => void;
}) {
	const { i18n } = useTranslation();

	return (
		<Table>
			<thead>
				<tr>
					<th>Time</th>
					<th>Team</th>
					{showText ? <th /> : null}
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
							{showText ? (
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
							{requestScrim ? (
								<td>
									<Button size="tiny" onClick={() => requestScrim(post.id)}>
										Book
									</Button>
								</td>
							) : null}
						</tr>
					);
				})}
			</tbody>
		</Table>
	);
}
