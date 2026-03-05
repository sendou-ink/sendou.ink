import { useTranslation } from "react-i18next";
import { Form, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouForm } from "~/form/SendouForm";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { FriendMenu } from "../components/FriendMenu";
import { sendFriendRequestBaseSchema } from "../friends-schemas";
import type { FriendsLoaderData } from "../loaders/friends.server";
import styles from "./friends.module.css";

export { action } from "../actions/friends.server";
export { loader } from "../loaders/friends.server";

export const handle: SendouRouteHandle = {
	i18n: ["friends"],
};

export default function FriendsPage() {
	const data = useLoaderData<FriendsLoaderData>();

	return (
		<Main halfWidth>
			<div className="stack lg">
				<SendFriendRequestSection />
				{data.incomingRequests.length > 0 ? <IncomingRequestsSection /> : null}
				{data.pendingRequests.length > 0 ? <PendingRequestsSection /> : null}
				<FriendsListSection />
			</div>
		</Main>
	);
}

function SendFriendRequestSection() {
	const { t } = useTranslation(["common", "friends"]);

	return (
		<section>
			<h2 className="text-lg">{t("friends:sendRequest.title")}</h2>
			<SendouForm
				schema={sendFriendRequestBaseSchema}
				submitButtonText={t("friends:sendRequest.submit")}
			>
				{({ FormField }) => <FormField name="userId" />}
			</SendouForm>
		</section>
	);
}

function IncomingRequestsSection() {
	const { t } = useTranslation(["common", "friends"]);
	const data = useLoaderData<FriendsLoaderData>();

	return (
		<section>
			<h2 className="text-lg">{t("friends:incomingRequests.title")}</h2>
			<div className="stack sm">
				{data.incomingRequests.map((request) => (
					<div key={request.id} className={styles.pendingRow}>
						<div className={styles.pendingUser}>
							<Avatar
								user={{
									discordId: request.sender.discordId,
									discordAvatar: request.sender.discordAvatar,
								}}
								size="xs"
							/>
							<span>{request.sender.username}</span>
						</div>
						<div className="stack horizontal sm">
							<Form method="post">
								<input type="hidden" name="_action" value="ACCEPT_REQUEST" />
								<input
									type="hidden"
									name="friendRequestId"
									value={request.id}
								/>
								<SubmitButton variant="outlined" size="miniscule">
									{t("common:actions.accept")}
								</SubmitButton>
							</Form>
							<Form method="post">
								<input type="hidden" name="_action" value="DECLINE_REQUEST" />
								<input
									type="hidden"
									name="friendRequestId"
									value={request.id}
								/>
								<SubmitButton variant="minimal-destructive" size="miniscule">
									{t("common:actions.decline")}
								</SubmitButton>
							</Form>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function PendingRequestsSection() {
	const { t } = useTranslation(["common", "friends"]);
	const data = useLoaderData<FriendsLoaderData>();

	return (
		<section>
			<h2 className="text-lg">{t("friends:pendingRequests.title")}</h2>
			<div className="stack sm">
				{data.pendingRequests.map((request) => (
					<div key={request.id} className={styles.pendingRow}>
						<div className={styles.pendingUser}>
							<Avatar
								user={{
									discordId: request.receiver.discordId,
									discordAvatar: request.receiver.discordAvatar,
								}}
								size="xs"
							/>
							<span>{request.receiver.username}</span>
						</div>
						<Form method="post">
							<input type="hidden" name="_action" value="CANCEL_REQUEST" />
							<input type="hidden" name="friendRequestId" value={request.id} />
							<SubmitButton variant="minimal-destructive" size="miniscule">
								{t("common:actions.cancel")}
							</SubmitButton>
						</Form>
					</div>
				))}
			</div>
		</section>
	);
}

function FriendsListSection() {
	const { t } = useTranslation(["common", "friends"]);
	const data = useLoaderData<FriendsLoaderData>();

	return (
		<section>
			<h2 className="text-lg">{t("friends:friendsList.title")}</h2>
			{data.friends.length === 0 ? (
				<p className="text-lighter text-sm">{t("friends:friendsList.empty")}</p>
			) : (
				<div className="stack xs">
					{data.friends.map((friend) => (
						<FriendMenu key={friend.id} name={friend.username} {...friend} />
					))}
				</div>
			)}
		</section>
	);
}
