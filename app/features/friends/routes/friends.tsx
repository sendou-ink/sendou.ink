import clsx from "clsx";
import { useState } from "react";
import { Radio, RadioGroup } from "react-aria-components";
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

type ViewFilter = "friends" | "team" | "all";

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
	const [filter, setFilter] = useState<ViewFilter>("friends");

	const viewLabels: Record<ViewFilter, string> = {
		friends: t("friends:view.friends"),
		team: t("friends:view.teamMembers"),
		all: t("friends:view.all"),
	};

	const shownItems = resolveShownItems(filter, data);
	const emptyKey =
		filter === "team"
			? "friends:teamMembers.empty"
			: "friends:friendsList.empty";

	return (
		<section>
			<div className={styles.friendsListHeader}>
				<h2 className="text-lg">{t("friends:friendsList.title")}</h2>
				<RadioGroup
					value={filter}
					onChange={(v) => setFilter(v as ViewFilter)}
					aria-label={t("friends:view.label")}
					orientation="horizontal"
					className="stack horizontal xs"
				>
					{(["friends", "team", "all"] as const).map((value) => (
						<Radio key={value} value={value}>
							{({ isSelected }) => (
								<span
									className={clsx(styles.filterRadio, {
										[styles.filterRadioSelected]: isSelected,
									})}
								>
									{viewLabels[value]}
								</span>
							)}
						</Radio>
					))}
				</RadioGroup>
			</div>
			{shownItems.length === 0 ? (
				<p className="text-lighter text-sm">{t(emptyKey)}</p>
			) : (
				<div className="stack xs">
					{shownItems.map((item) => (
						<FriendMenu key={item.id} name={item.username} {...item} />
					))}
				</div>
			)}
		</section>
	);
}

function resolveShownItems(
	filter: ViewFilter,
	data: Awaited<ReturnType<FriendsLoaderData>>,
) {
	if (filter === "friends") return data.friends;
	if (filter === "team") return data.teamMembers;

	const friendIds = new Set(data.friends.map((f) => f.id));
	const combined = [
		...data.friends,
		...data.teamMembers.filter((tm) => !friendIds.has(tm.id)),
	];

	return combined.sort((a, b) => {
		const aActive = a.subtitle ? 1 : 0;
		const bActive = b.subtitle ? 1 : 0;
		return bActive - aActive;
	});
}
