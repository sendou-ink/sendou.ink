import { useTranslation } from "react-i18next";
import { Form, Link, useLoaderData, useSearchParams } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { SubNav, SubNavLink } from "~/components/SubNav";
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

const VIEW_FILTERS = ["friends", "team", "all"] as const;
type ViewFilter = (typeof VIEW_FILTERS)[number];

export default function FriendsPage() {
	const data = useLoaderData<FriendsLoaderData>();

	return (
		<Main halfWidth>
			<div className="stack lg">
				<SendFriendRequestSection />
				<Divider />
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
			<h2 className="text-lg mb-2">{t("friends:sendRequest.title")}</h2>
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
						<Link to={request.sender.url} className={styles.pendingUser}>
							<Avatar
								user={{
									discordId: request.sender.discordId,
									discordAvatar: request.sender.discordAvatar,
								}}
								size="xxsm"
							/>
							<span className={styles.userName}>{request.sender.username}</span>
						</Link>
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
						<Link to={request.receiver.url} className={styles.pendingUser}>
							<Avatar
								user={{
									discordId: request.receiver.discordId,
									discordAvatar: request.receiver.discordAvatar,
								}}
								size="xxsm"
							/>
							<span className={styles.userName}>
								{request.receiver.username}
							</span>
						</Link>
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
	const [searchParams] = useSearchParams();

	const allCount = resolveShownItems("all", data).length;
	const filterCounts: Record<ViewFilter, number> = {
		friends: data.friends.length,
		team: data.teamMembers.length,
		all: allCount,
	};

	const viewParam = searchParams.get("view") as ViewFilter | null;
	const defaultFilter =
		VIEW_FILTERS.find((key) => filterCounts[key] > 0) ?? "friends";
	const filter =
		viewParam && VIEW_FILTERS.includes(viewParam) ? viewParam : defaultFilter;

	const viewLabels: Record<ViewFilter, string> = {
		friends: `${t("friends:view.friends")} (${filterCounts.friends})`,
		team: `${t("friends:view.teamMembers")} (${filterCounts.team})`,
		all: `${t("friends:view.all")} (${filterCounts.all})`,
	};

	const shownItems = resolveShownItems(filter, data);
	const emptyKey =
		filter === "team"
			? "friends:teamMembers.empty"
			: "friends:friendsList.empty";

	return (
		<section className="stack md">
			<div className={styles.friendsListHeader}>
				<h2 className="text-lg ml-1">{t("friends:friendsList.title")}</h2>
				<SubNav secondary>
					{VIEW_FILTERS.map((value) => (
						<SubNavLink
							key={value}
							to={`?view=${value}`}
							secondary
							controlled
							active={filter === value}
							unstable_defaultShouldRevalidate={false}
						>
							{viewLabels[value]}
						</SubNavLink>
					))}
				</SubNav>
			</div>
			<div>
				{shownItems.length === 0 ? (
					<p className="no-results">{t(emptyKey)}</p>
				) : (
					<div className="stack xs">
						{shownItems.map((item) => (
							<FriendMenu key={item.id} name={item.username} {...item} />
						))}
					</div>
				)}
			</div>
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
