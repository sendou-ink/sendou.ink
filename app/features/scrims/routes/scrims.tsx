import { Link, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Button } from "~/components/Button";
import { Popover } from "~/components/Popover";
import { Table } from "~/components/Table";
import { SpeechBubbleIcon } from "~/components/icons/SpeechBubble";
import { UsersIcon } from "~/components/icons/Users";
import { useIsMounted } from "~/hooks/useIsMounted";
import { databaseTimestampToDate } from "~/utils/dates";
import { userPage, userSubmittedImage } from "~/utils/urls";
import { Main } from "../../../components/Main";
import type { ScrimPost } from "../scrims-types";

import { loader } from "../loaders/scrims.server";
export { loader };

import "../scrims.css";

export default function ScrimsPage() {
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();

	if (!isMounted)
		return (
			<Main>
				<div className="scrims__placeholder" />
			</Main>
		);

	// console.log(data);

	return (
		<Main>
			<ScrimsDaySeparatedTables posts={data.posts} />
		</Main>
	);
}

export function ScrimsDaySeparatedTables({ posts }: { posts: ScrimPost[] }) {
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
						<ScrimsTable posts={posts!} />
					</div>
				);
			})}
		</div>
	);
}

export function ScrimsTable({ posts }: { posts: ScrimPost[] }) {
	const { i18n } = useTranslation();

	return (
		<Table>
			<thead>
				<tr>
					<th>Time</th>
					<th>Team</th>
					<th />
					<th>Divs</th>
					<th />
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
							<td>
								{post.divs ? (
									<>
										{post.divs.max} - {post.divs.min}
									</>
								) : null}
							</td>
							<td>
								<Button size="tiny">Book</Button>
							</td>
						</tr>
					);
				})}
			</tbody>
		</Table>
	);
}
