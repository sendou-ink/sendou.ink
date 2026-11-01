import * as React from "react";
import { useLoaderData } from "react-router";
import { BackLink } from "~/components/BackLink";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import type { ClientChatMessage } from "~/features/chat/chat-types";
import { Chat } from "~/features/chat/components/Chat";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { databaseTimestampNow } from "~/utils/dates";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/feed.$id.server";
import { FeedItemCard } from "../components/FeedItemCard";
import { feedItemActionSchema } from "../feed-schemas";
import { FEED_TEST_PAGE } from "../feed-urls";
import { loader } from "../loaders/feed.$id.server";
import styles from "./feed.$id.module.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["art", "builds", "gear"],
};

export default function FeedItemPage() {
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const { submit } = useActionSubmit(feedItemActionSchema);
	const [sent, setSent] = React.useState<ClientChatMessage[]>([]);

	const savedPublicIds = new Set(
		data.comments.map((comment) => comment.publicId),
	);
	const comments: ClientChatMessage[] = [
		...data.comments,
		...sent.filter((comment) => !savedPublicIds.has(comment.publicId)),
	];

	const sendComment = (comment: { publicId: string; contents: string }) => {
		if (!user) return;

		setSent((previous) => [
			...previous,
			{
				...comment,
				id: 0,
				roomId: 0,
				authorUserId: user.id,
				type: null,
				createdAt: databaseTimestampNow(),
				author: {
					id: user.id,
					username: user.username,
					customUrl: user.customUrl ?? null,
					avatar: user.avatar ?? null,
					pronouns: null,
					chatNameHue: null,
				},
				pending: true,
			},
		]);
		submit("COMMENT", comment);
	};

	return (
		<Main className={styles.page}>
			<div className={styles.thread}>
				<FeedItemCard
					item={data.item}
					now={data.now}
					commentCount={comments.length}
					headerAction={
						<BackLink to={FEED_TEST_PAGE} className={styles.back} />
					}
				/>
				<section aria-label="Comments">
					{comments.length === 0 ? (
						<p className={styles.empty}>No comments yet. Say something nice!</p>
					) : null}
					<Chat
						messages={comments}
						onSend={sendComment}
						messagesContainerClassName={
							comments.length === 0 ? styles.logEmpty : styles.log
						}
					/>
				</section>
			</div>
		</Main>
	);
}
