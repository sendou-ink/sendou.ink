import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { LinkButton } from "~/components/elements/Button";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import { useTopicRevalidation } from "~/features/chat/chat-hooks";
import { useGlobalStatus } from "~/features/global-status/GlobalStatusProvider";
import { useMarkSqLikesSeen } from "~/features/global-status/global-status-likes-seen";
import type { UserCardsById } from "~/features/user-card/user-card-types";
import { privateNoteSentimentScore } from "~/features/user-card/user-card-utils";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useHydrated } from "~/hooks/useHydrated";
import { useSearchParam } from "~/modules/search-params/hooks";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	MATCH_PROFILE_PAGE,
	navIconUrl,
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_STREAMS_PAGE,
} from "~/utils/urls";
import { action } from "../actions/q.looking.server";
import { GroupCard, type GroupCardTrail } from "../components/GroupCard";
import { GroupLeaver } from "../components/GroupLeaver";
import { LookingColumns, SortedCard } from "../components/LookingColumns";
import { MemberAdder } from "../components/MemberAdder";
import { canSuggest, groupExpiryStatus } from "../core/groups";
import { loader } from "../loaders/q.looking.server";
import { lookingSchema } from "../q-action-schemas";
import {
	FULL_GROUP_SIZE,
	SENDOUQ_LOOKING_CHANNEL,
	sqGroupChannel,
} from "../q-constants";
import { qLookingSearchParams } from "../q-search-params";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["user", "q"],
	breadcrumb: () => ({
		imgPath: navIconUrl("sendouq"),
		href: SENDOUQ_LOOKING_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Matchmaking",
		image: ogPageImage("sendouq"),
		location: args.location,
	});
};

export default function QLookingPage() {
	const { t } = useTranslation(["q"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [joining] = useSearchParam(qLookingSearchParams, "joining");

	const { status } = useGlobalStatus();

	useMarkSqLikesSeen({
		groupId: data.ownGroup?.id,
		receivedLikesCount: data.likes.received.length,
		status,
	});

	// pool-shape changes (a group joining/leaving, a morph, a match starting)
	useTopicRevalidation(SENDOUQ_LOOKING_CHANNEL);
	// group-specific updates (e.g. a received like)
	useTopicRevalidation(
		data.ownGroup ? sqGroupChannel(data.ownGroup.id) : "",
		Boolean(data.ownGroup),
	);

	const wasTryingToJoinAnotherTeam = joining;

	const showGoToSettingPrompt = () => {
		if (!data.ownGroup) return false;

		const isAlone = data.ownGroup.members.length === 1;
		const hasWeaponPool = Boolean(
			data.ownGroup.members.find((m) => m.id === user?.id)?.weapons,
		);
		const hasVCStatus =
			(data.ownGroup.members.find((m) => m.id === user?.id)?.languages ?? [])
				.length > 0;

		return isAlone && (!hasWeaponPool || !hasVCStatus);
	};

	return (
		<Main className="stack md">
			<InfoText />
			{wasTryingToJoinAnotherTeam ? (
				<div className="text-warning text-center">
					{t("q:looking.joiningGroupError")}
				</div>
			) : null}
			{showGoToSettingPrompt() ? (
				<Alert variation="INFO">{t("q:looking.goToSettingsPrompt")}</Alert>
			) : null}
			<Groups />
		</Main>
	);
}

function InfoText() {
	const { t } = useTranslation(["q"]);
	const isHydrated = useHydrated();
	const data = useLoaderData<typeof loader>();
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
	});

	const expiryStatus = data.ownGroup
		? groupExpiryStatus(data.ownGroup.latestActionAt)
		: null;

	if (expiryStatus === "EXPIRED") {
		return (
			<div className="text-xs text-lighter ml-auto text-error stack horizontal sm items-center">
				{t("q:looking.inactiveGroup")}{" "}
				<ActionButton
					schema={lookingSchema}
					action="REFRESH_GROUP"
					size="small"
					variant="minimal"
				>
					{t("q:looking.inactiveGroup.action")}
				</ActionButton>
			</div>
		);
	}

	if (expiryStatus === "EXPIRING_SOON") {
		return (
			<div className="text-xs text-lighter ml-auto text-warning stack horizontal sm items-center">
				{t("q:looking.inactiveGroup.soon")}{" "}
				<ActionButton
					schema={lookingSchema}
					action="REFRESH_GROUP"
					size="small"
					variant="minimal"
				>
					{t("q:looking.inactiveGroup.action")}
				</ActionButton>
			</div>
		);
	}

	return (
		<div
			className={clsx("text-xs text-lighter stack horizontal justify-between", {
				invisible: !isHydrated,
			})}
		>
			<div className="stack sm horizontal">
				<LinkButton
					to={MATCH_PROFILE_PAGE}
					size="small"
					variant="outlined"
					className="stack horizontal xs"
				>
					<Image path={navIconUrl("settings")} alt="" width={18} />
					{t("q:front.nav.settings.title")}
				</LinkButton>
				<StreamsLinkButton />
			</div>
			<span className="text-xxs">
				{isHydrated
					? t("q:looking.lastUpdatedAt", {
							time: timeFormatter.format(new Date(data.lastUpdated)) ?? "",
						})
					: "Placeholder"}
			</span>
		</div>
	);
}

function StreamsLinkButton() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	return (
		<LinkButton
			to={SENDOUQ_STREAMS_PAGE}
			size="small"
			variant="outlined"
			className="stack horizontal xs"
		>
			<Image path={navIconUrl("vods")} alt="" width={18} />
			{t("q:front.nav.streams.title")} ({data.streamsCount})
		</LinkButton>
	);
}

function Groups() {
	const data = useLoaderData<typeof loader>();

	const isFullGroup = data.ownGroup?.members.length === FULL_GROUP_SIZE;

	const suggestedByUsernames = new Map(
		data.suggestions.map((suggestion) => [
			suggestion.groupId,
			suggestion.createdByUsername,
		]),
	);
	const invitedByUsernames = new Map(
		data.likes.given.map((like) => [like.groupId, like.createdByUsername]),
	);
	const receivedLikes = new Map(
		data.likes.received.map((like) => [like.groupId, like]),
	);

	const suggestedGroupIds = new Set(suggestedByUsernames.keys());

	const groups = sortGroups(data.groups, {
		userCards: data.userCards,
		suggestedGroupIds,
	});
	const sortIndexes = new Map(groups.map((group, index) => [group.id, index]));

	const isSoloGroup = data.ownGroup?.members.length === 1;

	const trailOf = (groupId: number): GroupCardTrail | undefined => {
		if (isSoloGroup) return undefined;

		const invitedBy = invitedByUsernames.get(groupId);
		if (invitedBy) return { type: "INVITED", username: invitedBy };

		const suggestedBy = suggestedByUsernames.get(groupId);
		if (suggestedBy) return { type: "SUGGESTED", username: suggestedBy };

		return undefined;
	};

	const canSuggestGroups = Boolean(data.ownGroup && canSuggest(data.ownGroup));
	// a group already invited or suggested has nothing left to point out
	const isSuggestable = (groupId: number) =>
		canSuggestGroups &&
		!invitedByUsernames.has(groupId) &&
		!suggestedByUsernames.has(groupId);

	const receivedLikeAction = (groupId: number) => {
		if (!isFullGroup) return "GROUP_UP";

		if (receivedLikes.get(groupId)?.isRechallenge) {
			return "MATCH_UP_RECHALLENGE";
		}
		return "MATCH_UP";
	};

	const groupsReceivedLikesFrom = groups.filter((group) =>
		receivedLikes.has(group.id),
	);
	const invitedGroups = groups.filter(
		(group) => invitedByUsernames.has(group.id) && !receivedLikes.has(group.id),
	);
	const neutralGroups = groups.filter(
		(group) =>
			!invitedByUsernames.has(group.id) && !receivedLikes.has(group.id),
	);

	const groupCard = (
		group: (typeof groups)[number],
		cardAction: React.ComponentProps<typeof GroupCard>["action"],
	) => (
		<GroupCard
			group={group}
			action={cardAction}
			suggestable={isSuggestable(group.id)}
			trail={trailOf(group.id)}
			isSuggested={suggestedGroupIds.has(group.id)}
			ownGroup={data.ownGroup}
		/>
	);

	const sortedGroupCard = (
		group: (typeof groups)[number],
		cardAction: React.ComponentProps<typeof GroupCard>["action"],
	) => (
		<SortedCard key={group.id} sortIndex={sortIndexes.get(group.id)!}>
			{groupCard(group, cardAction)}
		</SortedCard>
	);

	return (
		<LookingColumns
			flipKey={data}
			isFullGroup={isFullGroup}
			own={
				data.ownGroup
					? {
							memberCount: data.ownGroup.members.length,
							content: (
								<>
									<GroupCard
										group={data.ownGroup}
										ownGroup={data.ownGroup}
										kickableUserIds={data.kickableUserIds}
									/>
									{data.ownGroup.inviteCode ? (
										<MemberAdder
											inviteCode={data.ownGroup.inviteCode}
											groupMemberIds={data.ownGroup.members.map((m) => m.id)}
										/>
									) : null}
									<GroupLeaver
										type={
											data.ownGroup.members.length === 1
												? "LEAVE_Q"
												: "LEAVE_GROUP"
										}
									/>
								</>
							),
						}
					: null
			}
			invited={
				data.ownGroup
					? invitedGroups.map((group) => sortedGroupCard(group, "UNLIKE"))
					: null
			}
			available={neutralGroups.map((group) => sortedGroupCard(group, "LIKE"))}
			availableCount={neutralGroups.length}
			received={
				<>
					{!data.ownGroup ? <JoinQueuePrompt /> : null}
					{groupsReceivedLikesFrom.map((group) => (
						<React.Fragment key={group.id}>
							{groupCard(group, receivedLikeAction(group.id))}
						</React.Fragment>
					))}
				</>
			}
			receivedCount={groupsReceivedLikesFrom.length}
		/>
	);
}

/**
 * Floats teammate-suggested groups to the top, then positive private note groups up and negative
 * ones down, keeping the server's order within each bucket and full (censored) groups last. Note
 * sentiment comes from the already-loaded `userCards`.
 */
function sortGroups<T extends { id: number; members?: { id: number }[] }>(
	groups: T[],
	{
		userCards,
		suggestedGroupIds,
	}: {
		userCards: UserCardsById;
		suggestedGroupIds: Set<number>;
	},
): T[] {
	const sentimentScore = (group: T) =>
		group.members ? privateNoteSentimentScore(group.members, userCards) : 0;

	return groups.toSorted((a, b) => {
		const aIsSuggested = suggestedGroupIds.has(a.id);
		const bIsSuggested = suggestedGroupIds.has(b.id);
		if (aIsSuggested !== bIsSuggested) return aIsSuggested ? -1 : 1;

		const aIsFull = !a.members;
		const bIsFull = !b.members;
		if (aIsFull !== bIsFull) return aIsFull ? 1 : -1;

		return sentimentScore(b) - sentimentScore(a);
	});
}

function JoinQueuePrompt() {
	const { t } = useTranslation(["q"]);

	return (
		<LinkButton to={SENDOUQ_PAGE} variant="minimal" size="small">
			{t("q:looking.joinQPrompt")}
		</LinkButton>
	);
}
