import type {
	ActionFunction,
	LoaderFunctionArgs,
	MetaFunction,
} from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { LinkButton } from "~/components/Button";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { NewTabs } from "~/components/NewTabs";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { getUser, requireUser } from "~/features/auth/core/user.server";
import * as NotificationService from "~/features/chat/NotificationService.server";
import { Chat, useChat } from "~/features/chat/components/Chat";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import { userSkills } from "~/features/mmr/tiered.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { useAutoRefresh } from "~/hooks/useAutoRefresh";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useWindowSize } from "~/hooks/useWindowSize";
import invariant from "~/utils/invariant";
import { metaTags } from "~/utils/remix";
import {
	type SendouRouteHandle,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { errorIsSqliteForeignKeyConstraintFailure } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_SETTINGS_PAGE,
	SENDOUQ_STREAMS_PAGE,
	navIconUrl,
	sendouQMatchPage,
} from "~/utils/urls";
import { isAtLeastFiveDollarTierPatreon } from "~/utils/users";
import { GroupCard } from "../components/GroupCard";
import { GroupLeaver } from "../components/GroupLeaver";
import { MemberAdder } from "../components/MemberAdder";
import { groupAfterMorph, hasGroupManagerPerms } from "../core/groups";
import {
	addFutureMatchModes,
	addNoScreenIndicator,
	addReplayIndicator,
	addSkillRangeToGroups,
	addSkillsToGroups,
	censorGroups,
	censorGroupsIfOwnExpired,
	divideGroups,
	groupExpiryStatus,
	membersNeededForFull,
	sortGroupsBySkillAndSentiment,
} from "../core/groups.server";
import { createMatchMemento, matchMapList } from "../core/match.server";
import { FULL_GROUP_SIZE } from "../q-constants";
import { lookingSchema } from "../q-schemas.server";
import type { LookingGroupWithInviteCode } from "../q-types";
import { groupRedirectLocationByCurrentLocation } from "../q-utils";
import { addLike } from "../queries/addLike.server";
import { addManagerRole } from "../queries/addManagerRole.server";
import { chatCodeByGroupId } from "../queries/chatCodeByGroupId.server";
import { createMatch } from "../queries/createMatch.server";
import { deleteLike } from "../queries/deleteLike.server";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { findLikes } from "../queries/findLikes";
import { findRecentMatchPlayersByUserId } from "../queries/findRecentMatchPlayersByUserId.server";
import { groupHasMatch } from "../queries/groupHasMatch.server";
import { groupSize } from "../queries/groupSize.server";
import { groupSuccessorOwner } from "../queries/groupSuccessorOwner";
import { leaveGroup } from "../queries/leaveGroup.server";
import { likeExists } from "../queries/likeExists.server";
import { morphGroups } from "../queries/morphGroups.server";
import { refreshGroup } from "../queries/refreshGroup.server";
import { removeManagerRole } from "../queries/removeManagerRole.server";
import { updateNote } from "../queries/updateNote.server";

import "../q.css";

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
		location: args.location,
	});
};

// this function doesn't throw normally because we are assuming
// if there is a validation error the user saw stale data
// and when we return null we just force a refresh
export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: lookingSchema,
	});
	const currentGroup = findCurrentGroupByUserId(user.id);
	if (!currentGroup) return null;

	// this throws because there should normally be no way user loses ownership by the action of some other user
	const validateIsGroupOwner = () =>
		validate(currentGroup.role === "OWNER", "Not  owner");
	const isGroupManager = () =>
		currentGroup.role === "MANAGER" || currentGroup.role === "OWNER";

	switch (data._action) {
		case "LIKE": {
			if (!isGroupManager()) return null;

			try {
				addLike({
					likerGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
				});
			} catch (e) {
				if (!(e instanceof Error)) throw e;
				// the group disbanded before we could like it
				if (errorIsSqliteForeignKeyConstraintFailure(e)) return null;

				throw e;
			}
			refreshGroup(currentGroup.id);

			const targetChatCode = chatCodeByGroupId(data.targetGroupId);
			if (targetChatCode) {
				NotificationService.notify({
					room: targetChatCode,
					type: "LIKE_RECEIVED",
					revalidateOnly: true,
				});
			}

			break;
		}
		case "RECHALLENGE": {
			if (!isGroupManager()) return null;

			await QRepository.rechallenge({
				likerGroupId: currentGroup.id,
				targetGroupId: data.targetGroupId,
			});

			const targetChatCode = chatCodeByGroupId(data.targetGroupId);
			if (targetChatCode) {
				NotificationService.notify({
					room: targetChatCode,
					type: "LIKE_RECEIVED",
					revalidateOnly: true,
				});
			}
			break;
		}
		case "UNLIKE": {
			if (!isGroupManager()) return null;

			deleteLike({
				likerGroupId: currentGroup.id,
				targetGroupId: data.targetGroupId,
			});
			refreshGroup(currentGroup.id);

			break;
		}
		case "GROUP_UP": {
			if (!isGroupManager()) return null;
			if (
				!likeExists({
					targetGroupId: currentGroup.id,
					likerGroupId: data.targetGroupId,
				})
			) {
				return null;
			}

			const lookingGroups = await QRepository.findLookingGroups({
				maxGroupSize: membersNeededForFull(groupSize(currentGroup.id)),
				ownGroupId: currentGroup.id,
				includeChatCode: true,
			});

			const ourGroup = lookingGroups.find(
				(group) => group.id === currentGroup.id,
			);
			if (!ourGroup) return null;
			const theirGroup = lookingGroups.find(
				(group) => group.id === data.targetGroupId,
			);
			if (!theirGroup) return null;

			const { id: survivingGroupId } = groupAfterMorph({
				liker: "THEM",
				ourGroup,
				theirGroup,
			});

			const otherGroup =
				ourGroup.id === survivingGroupId ? theirGroup : ourGroup;

			invariant(ourGroup.members, "our group has no members");
			invariant(otherGroup.members, "other group has no members");

			morphGroups({
				survivingGroupId,
				otherGroupId: otherGroup.id,
				newMembers: otherGroup.members.map((m) => m.id),
			});
			refreshGroup(survivingGroupId);

			if (ourGroup.chatCode && theirGroup.chatCode) {
				NotificationService.notify([
					{
						room: ourGroup.chatCode,
						type: "NEW_GROUP",
						revalidateOnly: true,
					},
					{
						room: theirGroup.chatCode,
						type: "NEW_GROUP",
						revalidateOnly: true,
					},
				]);
			}

			break;
		}
		case "MATCH_UP_RECHALLENGE":
		case "MATCH_UP": {
			if (!isGroupManager()) return null;
			if (
				!likeExists({
					targetGroupId: currentGroup.id,
					likerGroupId: data.targetGroupId,
				})
			) {
				return null;
			}

			const lookingGroups = await QRepository.findLookingGroups({
				minGroupSize: FULL_GROUP_SIZE,
				ownGroupId: currentGroup.id,
				includeChatCode: true,
			});

			const ourGroup = lookingGroups.find(
				(group) => group.id === currentGroup.id,
			);
			if (!ourGroup) return null;
			const theirGroup = lookingGroups.find(
				(group) => group.id === data.targetGroupId,
			);
			if (!theirGroup) return null;

			validate(
				ourGroup.members.length === FULL_GROUP_SIZE,
				"'ourGroup' is not full",
			);
			validate(
				theirGroup.members.length === FULL_GROUP_SIZE,
				"'theirGroup' is not full",
			);

			validate(!groupHasMatch(ourGroup.id), "Our group already has a match");
			validate(
				!groupHasMatch(theirGroup.id),
				"Their group already has a match",
			);

			const ourGroupPreferences = await QRepository.mapModePreferencesByGroupId(
				ourGroup.id,
			);
			const theirGroupPreferences =
				await QRepository.mapModePreferencesByGroupId(theirGroup.id);
			const mapList = matchMapList(
				{
					id: ourGroup.id,
					preferences: ourGroupPreferences,
				},
				{
					id: theirGroup.id,
					preferences: theirGroupPreferences,
					ignoreModePreferences: data._action === "MATCH_UP_RECHALLENGE",
				},
			);
			const createdMatch = createMatch({
				alphaGroupId: ourGroup.id,
				bravoGroupId: theirGroup.id,
				mapList,
				memento: createMatchMemento({
					own: { group: ourGroup, preferences: ourGroupPreferences },
					their: { group: theirGroup, preferences: theirGroupPreferences },
					mapList,
				}),
			});

			if (ourGroup.chatCode && theirGroup.chatCode) {
				NotificationService.notify([
					{
						room: ourGroup.chatCode,
						type: "MATCH_STARTED",
						revalidateOnly: true,
					},
					{
						room: theirGroup.chatCode,
						type: "MATCH_STARTED",
						revalidateOnly: true,
					},
				]);
			}

			throw redirect(sendouQMatchPage(createdMatch.id));
		}
		case "GIVE_MANAGER": {
			validateIsGroupOwner();

			addManagerRole({
				groupId: currentGroup.id,
				userId: data.userId,
			});
			refreshGroup(currentGroup.id);

			break;
		}
		case "REMOVE_MANAGER": {
			validateIsGroupOwner();

			removeManagerRole({
				groupId: currentGroup.id,
				userId: data.userId,
			});
			refreshGroup(currentGroup.id);

			break;
		}
		case "LEAVE_GROUP": {
			validate(!currentGroup.matchId, "Can't leave group while in a match");
			let newOwnerId: number | null = null;
			if (currentGroup.role === "OWNER") {
				newOwnerId = groupSuccessorOwner(currentGroup.id);
			}

			leaveGroup({
				groupId: currentGroup.id,
				userId: user.id,
				newOwnerId,
				wasOwner: currentGroup.role === "OWNER",
			});

			const targetChatCode = chatCodeByGroupId(currentGroup.id);
			if (targetChatCode) {
				NotificationService.notify({
					room: targetChatCode,
					type: "USER_LEFT",
					context: { name: user.username },
				});
			}

			throw redirect(SENDOUQ_PAGE);
		}
		case "KICK_FROM_GROUP": {
			validateIsGroupOwner();
			validate(data.userId !== user.id, "Can't kick yourself");

			leaveGroup({
				groupId: currentGroup.id,
				userId: data.userId,
				newOwnerId: null,
				wasOwner: false,
			});

			break;
		}
		case "REFRESH_GROUP": {
			refreshGroup(currentGroup.id);

			break;
		}
		case "UPDATE_NOTE": {
			updateNote({
				note: data.value,
				groupId: currentGroup.id,
				userId: user.id,
			});
			refreshGroup(currentGroup.id);

			break;
		}
		case "DELETE_PRIVATE_USER_NOTE": {
			await QRepository.deletePrivateUserNote({
				authorId: user.id,
				targetId: data.targetId,
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUser(request);

	const isPreview = Boolean(
		new URL(request.url).searchParams.get("preview") === "true" &&
			user &&
			isAtLeastFiveDollarTierPatreon(user),
	);

	const currentGroup =
		user && !isPreview ? findCurrentGroupByUserId(user.id) : undefined;
	const redirectLocation = isPreview
		? undefined
		: groupRedirectLocationByCurrentLocation({
				group: currentGroup,
				currentLocation: "looking",
			});

	if (redirectLocation) {
		throw redirect(redirectLocation);
	}

	invariant(currentGroup || isPreview, "currentGroup is undefined");

	const currentGroupSize = currentGroup ? groupSize(currentGroup.id) : 1;
	const groupIsFull = currentGroupSize === FULL_GROUP_SIZE;

	const dividedGroups = divideGroups({
		groups: await QRepository.findLookingGroups({
			maxGroupSize:
				groupIsFull || isPreview
					? undefined
					: membersNeededForFull(currentGroupSize),
			minGroupSize: groupIsFull && !isPreview ? FULL_GROUP_SIZE : undefined,
			ownGroupId: currentGroup?.id,
			includeMapModePreferences: Boolean(groupIsFull || isPreview),
			loggedInUserId: user?.id,
		}),
		ownGroupId: currentGroup?.id,
		likes: currentGroup ? findLikes(currentGroup.id) : [],
	});

	const season = currentOrPreviousSeason(new Date());

	const {
		intervals,
		userSkills: calculatedUserSkills,
		isAccurateTiers,
	} = userSkills(season!.nth);
	const groupsWithSkills = addSkillsToGroups({
		groups: dividedGroups,
		intervals,
		userSkills: calculatedUserSkills,
	});

	const groupsWithFutureMatchModes = addFutureMatchModes(groupsWithSkills);

	const groupsWithNoScreenIndicator = addNoScreenIndicator(
		groupsWithFutureMatchModes,
	);

	const groupsWithReplayIndicator = groupIsFull
		? addReplayIndicator({
				groups: groupsWithNoScreenIndicator,
				recentMatchPlayers: findRecentMatchPlayersByUserId(user!.id),
				userId: user!.id,
			})
		: groupsWithNoScreenIndicator;

	const censoredGroups = censorGroups({
		groups: groupsWithReplayIndicator,
		showInviteCode: currentGroup
			? hasGroupManagerPerms(currentGroup.role) && !groupIsFull
			: false,
	});

	const rangedGroups = addSkillRangeToGroups({
		groups: censoredGroups,
		hasLeviathan: isAccurateTiers,
		isPreview,
	});

	const sortedGroups = sortGroupsBySkillAndSentiment({
		groups: rangedGroups,
		intervals,
		userSkills: calculatedUserSkills,
		userId: user?.id,
	});

	const expiryStatus = groupExpiryStatus(currentGroup);

	return {
		groups: censorGroupsIfOwnExpired({
			groups: sortedGroups,
			ownGroupExpiryStatus: expiryStatus,
		}),
		role: currentGroup ? currentGroup.role : ("PREVIEWER" as const),
		chatCode: currentGroup?.chatCode,
		lastUpdated: new Date().getTime(),
		streamsCount: (await cachedStreams()).length,
		expiryStatus: groupExpiryStatus(currentGroup),
	};
};

export default function QLookingPage() {
	const { t } = useTranslation(["q"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [searchParams] = useSearchParams();
	useAutoRefresh(data.lastUpdated);

	const wasTryingToJoinAnotherTeam = searchParams.get("joining") === "true";

	const showGoToSettingPrompt = () => {
		if (!data.groups.own) return false;

		const isAlone = data.groups.own.members!.length === 1;
		const hasWeaponPool = Boolean(
			data.groups.own.members!.find((m) => m.id === user?.id)?.weapons,
		);
		const hasVCStatus =
			(data.groups.own.members!.find((m) => m.id === user?.id)?.languages ?? [])
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
	const { t, i18n } = useTranslation(["q"]);
	const isMounted = useIsMounted();
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();

	if (data.expiryStatus === "EXPIRED") {
		return (
			<fetcher.Form
				method="post"
				className="text-xs text-lighter ml-auto text-error stack horizontal sm"
			>
				{t("q:looking.inactiveGroup")}{" "}
				<SubmitButton
					size="tiny"
					variant="minimal"
					_action="REFRESH_GROUP"
					state={fetcher.state}
				>
					{t("q:looking.inactiveGroup.action")}
				</SubmitButton>
			</fetcher.Form>
		);
	}

	if (data.expiryStatus === "EXPIRING_SOON") {
		return (
			<fetcher.Form
				method="post"
				className="text-xs text-lighter ml-auto text-warning stack horizontal sm"
			>
				{t("q:looking.inactiveGroup.soon")}{" "}
				<SubmitButton
					size="tiny"
					variant="minimal"
					_action="REFRESH_GROUP"
					state={fetcher.state}
				>
					{t("q:looking.inactiveGroup.action")}
				</SubmitButton>
			</fetcher.Form>
		);
	}

	return (
		<div
			className={clsx("text-xs text-lighter stack horizontal justify-between", {
				invisible: !isMounted,
			})}
		>
			<div className="stack sm horizontal">
				<LinkButton
					to={SENDOUQ_SETTINGS_PAGE}
					size="tiny"
					variant="outlined"
					className="stack horizontal xs"
				>
					<Image path={navIconUrl("settings")} alt="" width={18} />
					{t("q:front.nav.settings.title")}
				</LinkButton>
				<StreamsLinkButton />
			</div>
			<span className="text-xxs">
				{isMounted
					? t("q:looking.lastUpdatedAt", {
							time: new Date(data.lastUpdated).toLocaleTimeString(
								i18n.language,
								{
									hour: "2-digit",
									minute: "2-digit",
								},
							),
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
			size="tiny"
			variant="outlined"
			className="stack horizontal xs"
		>
			<Image path={navIconUrl("vods")} alt="" width={18} />
			{t("q:front.nav.streams.title")} ({data.streamsCount})
		</LinkButton>
	);
}

function Groups() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();

	const [_unseenMessages, setUnseenMessages] = React.useState(0);
	const [chatVisible, setChatVisible] = React.useState(false);
	const { width } = useWindowSize();

	const chatUsers = React.useMemo(() => {
		return Object.fromEntries(
			(data.groups.own?.members ?? []).map((m) => [m.id, m]),
		);
	}, [data]);

	const rooms = React.useMemo(() => {
		return data.chatCode
			? [
					{
						code: data.chatCode,
						label: "Group",
					},
				]
			: [];
	}, [data.chatCode]);

	const onNewMessage = React.useCallback(() => {
		setUnseenMessages((msg) => msg + 1);
	}, []);

	const chat = useChat({ rooms, onNewMessage });

	const onChatMount = React.useCallback(() => {
		setChatVisible(true);
	}, []);

	const onChatUnmount = React.useCallback(() => {
		setChatVisible(false);
		setUnseenMessages(0);
	}, []);

	const unseenMessages = chatVisible ? 0 : _unseenMessages;

	if (!isMounted) return null;

	const isMobile = width < 750;
	const isFullGroup =
		data.groups.own && data.groups.own.members!.length === FULL_GROUP_SIZE;
	const ownGroup = data.groups.own as LookingGroupWithInviteCode | undefined;

	const renderChat = data.groups.own && data.groups.own.members!.length > 1;

	const invitedGroupsDesktop = (
		<div className="stack sm">
			<ColumnHeader>
				{t(
					isFullGroup
						? "q:looking.columns.challenged"
						: "q:looking.columns.invited",
				)}
			</ColumnHeader>
			{data.groups.neutral
				.filter((group) => group.isLiked)
				.map((group) => {
					return (
						<GroupCard
							key={group.id}
							group={group}
							action="UNLIKE"
							ownRole={data.role}
							isExpired={data.expiryStatus === "EXPIRED"}
							showNote
						/>
					);
				})}
		</div>
	);

	const chatElement = (
		<div>
			{renderChat ? (
				<>
					<Chat
						rooms={rooms}
						users={chatUsers}
						className="w-full"
						messagesContainerClassName="q__chat-messages-container"
						chat={chat}
						onMount={onChatMount}
						onUnmount={onChatUnmount}
					/>
					{!isMobile ? (
						<div className="mt-4">{invitedGroupsDesktop}</div>
					) : null}
				</>
			) : null}
		</div>
	);

	const ownGroupElement = ownGroup ? (
		<div className="stack md">
			{!renderChat && (
				<ColumnHeader>{t("q:looking.columns.myGroup")}</ColumnHeader>
			)}
			<GroupCard group={ownGroup} ownRole={data.role} ownGroup showNote />
			{ownGroup?.inviteCode ? (
				<MemberAdder
					inviteCode={ownGroup.inviteCode}
					groupMemberIds={(ownGroup.members ?? [])?.map((m) => m.id)}
				/>
			) : null}
			<GroupLeaver
				type={ownGroup.members.length === 1 ? "LEAVE_Q" : "LEAVE_GROUP"}
			/>
			{!isMobile ? invitedGroupsDesktop : null}
		</div>
	) : null;

	// no animations needed if liking group on mobile as they stay in place
	const flipKey = `${data.groups.neutral
		.map((g) => `${g.id}-${isMobile ? true : g.isLiked}`)
		.join(":")};${data.groups.likesReceived.map((g) => g.id).join(":")}`;

	return (
		<Flipper flipKey={flipKey}>
			<div
				className={clsx("q__groups-container", {
					"q__groups-container__mobile": isMobile,
				})}
			>
				{!isMobile ? (
					<div>
						<NewTabs
							disappearing
							type="divider"
							tabs={[
								{
									label: t("q:looking.columns.myGroup"),
									number: data.groups.own ? data.groups.own.members!.length : 0,
									hidden: !data.groups.own,
								},
								{
									label: t("q:looking.columns.chat"),
									hidden: !renderChat,
									number: unseenMessages,
								},
							]}
							content={[
								{
									key: "own",
									element: ownGroupElement,
								},
								{
									key: "chat",
									element: chatElement,
									hidden: !data.chatCode,
								},
							]}
						/>
					</div>
				) : null}
				<div className="q__groups-inner-container">
					<NewTabs
						disappearing
						scrolling={isMobile}
						tabs={[
							{
								label: t("q:looking.columns.groups"),
								number: data.groups.neutral.length,
							},
							{
								label: t(
									isFullGroup
										? "q:looking.columns.challenges"
										: "q:looking.columns.invitations",
								),
								number: data.groups.likesReceived.length,
								hidden: !isMobile,
							},
							{
								label: t("q:looking.columns.myGroup"),
								number: data.groups.own ? data.groups.own.members!.length : 0,
								hidden: !isMobile || !data.groups.own,
							},
							{
								label: t("q:looking.columns.chat"),
								hidden: !isMobile || !renderChat,
								number: unseenMessages,
							},
						]}
						content={[
							{
								key: "groups",
								element: (
									<div className="stack sm">
										<ColumnHeader>
											{t("q:looking.columns.available")}
										</ColumnHeader>
										{data.groups.neutral
											.filter((group) => isMobile || !group.isLiked)
											.map((group) => {
												return (
													<GroupCard
														key={group.id}
														group={group}
														action={group.isLiked ? "UNLIKE" : "LIKE"}
														ownRole={data.role}
														isExpired={data.expiryStatus === "EXPIRED"}
														showNote
													/>
												);
											})}
									</div>
								),
							},
							{
								key: "received",
								hidden: !isMobile,
								element: (
									<div className="stack sm">
										{!data.groups.own ? <JoinQueuePrompt /> : null}
										{data.groups.likesReceived.map((group) => {
											const action = () => {
												if (!isFullGroup) return "GROUP_UP";

												if (group.isRechallenge) return "MATCH_UP_RECHALLENGE";
												return "MATCH_UP";
											};

											return (
												<GroupCard
													key={group.id}
													group={group}
													action={action()}
													ownRole={data.role}
													isExpired={data.expiryStatus === "EXPIRED"}
													showNote
												/>
											);
										})}
									</div>
								),
							},
							{
								key: "own",
								hidden: !isMobile,
								element: ownGroupElement,
							},
							{
								key: "chat",
								element: chatElement,
								hidden: !isMobile || !data.chatCode,
							},
						]}
					/>
				</div>
				{!isMobile ? (
					<div className="stack sm">
						<ColumnHeader>
							{t(
								isFullGroup
									? "q:looking.columns.challenges"
									: "q:looking.columns.invitations",
							)}
						</ColumnHeader>
						{!data.groups.own ? <JoinQueuePrompt /> : null}
						{data.groups.likesReceived.map((group) => {
							const action = () => {
								if (!isFullGroup) return "GROUP_UP";

								if (group.isRechallenge) return "MATCH_UP_RECHALLENGE";
								return "MATCH_UP";
							};

							return (
								<GroupCard
									key={group.id}
									group={group}
									action={action()}
									ownRole={data.role}
									isExpired={data.expiryStatus === "EXPIRED"}
									showNote
								/>
							);
						})}
					</div>
				) : null}
			</div>
		</Flipper>
	);
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
	const { width } = useWindowSize();

	const isMobile = width < 750;

	if (isMobile) return null;

	return <div className="q__column-header">{children}</div>;
}

function JoinQueuePrompt() {
	const { t } = useTranslation(["q"]);

	return (
		<LinkButton to={SENDOUQ_PAGE} variant="minimal" size="tiny">
			{t("q:looking.joinQPrompt")}
		</LinkButton>
	);
}
