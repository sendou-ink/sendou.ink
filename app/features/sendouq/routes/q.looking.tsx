import type { MetaFunction } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { LinkButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { useChat } from "~/features/chat/chat-hooks";
import { Chat } from "~/features/chat/components/Chat";
import { useAutoRefresh } from "~/hooks/useAutoRefresh";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { useWindowSize } from "~/hooks/useWindowSize";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	navIconUrl,
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_SETTINGS_PAGE,
	SENDOUQ_STREAMS_PAGE,
} from "~/utils/urls";
import { action } from "../actions/q.looking.server";
import { GroupCard } from "../components/GroupCard";
import { GroupLeaver } from "../components/GroupLeaver";
import { MemberAdder } from "../components/MemberAdder";
import { GroupProvider } from "../contexts/GroupContext";
import { groupExpiryStatus } from "../core/groups";
import { loader } from "../loaders/q.looking.server";
import { FULL_GROUP_SIZE } from "../q-constants";
export { action, loader };

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

export default function QLookingShell() {
	const isMounted = useIsMounted();

	if (!isMounted)
		return (
			<Main>
				<Placeholder />
			</Main>
		);

	return <QLookingPage />;
}

function QLookingPage() {
	const { t } = useTranslation(["q"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [searchParams] = useSearchParams();
	useAutoRefresh(data.lastUpdated);

	const wasTryingToJoinAnotherTeam = searchParams.get("joining") === "true";

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
		<GroupProvider
			ownGroup={data.ownGroup}
			isGroupOwner={
				data.ownGroup
					? data.ownGroup.members.some(
							(m) => m.id === user?.id && m.role === "OWNER",
						)
					: false
			}
			isGroupManager={
				data.ownGroup
					? data.ownGroup.members.some(
							(m) => m.id === user?.id && m.role === "MANAGER",
						)
					: false
			}
			isExpired={
				data.ownGroup
					? groupExpiryStatus(data.ownGroup.latestActionAt) === "EXPIRED"
					: false
			}
		>
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
		</GroupProvider>
	);
}

function InfoText() {
	const { t } = useTranslation(["q"]);
	const isMounted = useIsMounted();
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();
	const { formatTime } = useTimeFormat();

	const expiryStatus = data.ownGroup
		? groupExpiryStatus(data.ownGroup.latestActionAt)
		: null;

	if (expiryStatus === "EXPIRED") {
		return (
			<fetcher.Form
				method="post"
				className="text-xs text-lighter ml-auto text-error stack horizontal sm"
			>
				{t("q:looking.inactiveGroup")}{" "}
				<SubmitButton
					size="small"
					variant="minimal"
					_action="REFRESH_GROUP"
					state={fetcher.state}
				>
					{t("q:looking.inactiveGroup.action")}
				</SubmitButton>
			</fetcher.Form>
		);
	}

	if (expiryStatus === "EXPIRING_SOON") {
		return (
			<fetcher.Form
				method="post"
				className="text-xs text-lighter ml-auto text-warning stack horizontal sm"
			>
				{t("q:looking.inactiveGroup.soon")}{" "}
				<SubmitButton
					size="small"
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
				{isMounted
					? t("q:looking.lastUpdatedAt", {
							time: formatTime(new Date(data.lastUpdated)),
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
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();

	const [_unseenMessages, setUnseenMessages] = React.useState(0);
	const [chatVisible, setChatVisible] = React.useState(false);
	const { width } = useWindowSize();

	const chatUsers = React.useMemo(() => {
		return Object.fromEntries(
			(data.ownGroup?.members ?? []).map((m) => [m.id, m]),
		);
	}, [data]);

	const rooms = React.useMemo(() => {
		return data.ownGroup?.chatCode
			? [
					{
						code: data.ownGroup.chatCode,
						label: "Group",
					},
				]
			: [];
	}, [data.ownGroup?.chatCode]);

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
		data.ownGroup && data.ownGroup.members.length === FULL_GROUP_SIZE;

	const showChat = data.ownGroup && data.ownGroup.members.length > 1;

	const invitedGroupsDesktop = (
		<div className="stack sm">
			<ColumnHeader>
				{t(
					isFullGroup
						? "q:looking.columns.challenged"
						: "q:looking.columns.invited",
				)}
			</ColumnHeader>
			{data.groups
				.filter((group) =>
					data.likes.given.some((like) => like.groupId === group.id),
				)
				.map((group) => {
					return (
						<GroupCard key={group.id} group={group} action="UNLIKE" showNote />
					);
				})}
		</div>
	);

	const chatElement = (
		<div>
			{showChat ? (
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

	const ownGroupElement = data.ownGroup ? (
		<div className="stack md">
			{!showChat && (
				<ColumnHeader>{t("q:looking.columns.myGroup")}</ColumnHeader>
			)}
			<GroupCard group={data.ownGroup} showNote />
			{data.ownGroup.inviteCode ? (
				<MemberAdder
					inviteCode={data.ownGroup.inviteCode}
					groupMemberIds={data.ownGroup.members.map((m) => m.id)}
				/>
			) : null}
			<GroupLeaver
				type={data?.ownGroup.members.length === 1 ? "LEAVE_Q" : "LEAVE_GROUP"}
			/>
			{!isMobile ? invitedGroupsDesktop : null}
		</div>
	) : null;

	const neutralGroups = data.groups.filter(
		(group) =>
			!data.likes.given.some((like) => like.groupId === group.id) &&
			!data.likes.received.some((like) => like.groupId === group.id),
	);
	const groupsReceivedLikesFrom = data.groups.filter((group) =>
		data.likes.received.some((like) => like.groupId === group.id),
	);

	// no animations needed if liking group on mobile as they stay in place
	const flipKey = `${neutralGroups
		.map(
			(g) =>
				`${g.id}-${isMobile ? true : data.likes.given.some((l) => l.groupId === g.id)}`,
		)
		.join(":")};${groupsReceivedLikesFrom.map((g) => g.id).join(":")}`;

	return (
		<Flipper flipKey={flipKey}>
			<div
				className={clsx("q__groups-container", {
					"q__groups-container__mobile": isMobile,
				})}
			>
				{!isMobile ? (
					<div>
						<SendouTabs>
							<SendouTabList>
								{data.ownGroup && (
									<SendouTab id="own" number={data.ownGroup.members.length}>
										{t("q:looking.columns.myGroup")}
									</SendouTab>
								)}
								{showChat && (
									<SendouTab id="chat" number={unseenMessages}>
										{t("q:looking.columns.chat")}
									</SendouTab>
								)}
							</SendouTabList>
							<SendouTabPanel id="own">{ownGroupElement}</SendouTabPanel>
							{data.ownGroup?.chatCode && (
								<SendouTabPanel id="chat">{chatElement}</SendouTabPanel>
							)}
						</SendouTabs>
					</div>
				) : null}
				<div className="q__groups-inner-container">
					<SendouTabs>
						<SendouTabList scrolling={isMobile}>
							<SendouTab id="groups" number={neutralGroups.length}>
								{t("q:looking.columns.groups")}
							</SendouTab>
							{isMobile && (
								<SendouTab
									id="received"
									number={groupsReceivedLikesFrom.length}
								>
									{t(
										isFullGroup
											? "q:looking.columns.challenges"
											: "q:looking.columns.invitations",
									)}
								</SendouTab>
							)}
							{isMobile && data.ownGroup && (
								<SendouTab id="own" number={data.ownGroup.members.length}>
									{t("q:looking.columns.myGroup")}
								</SendouTab>
							)}
							{isMobile && showChat && (
								<SendouTab id="chat" number={unseenMessages}>
									{t("q:looking.columns.chat")}
								</SendouTab>
							)}
						</SendouTabList>
						<SendouTabPanel id="groups">
							<div className="stack sm">
								<ColumnHeader>{t("q:looking.columns.available")}</ColumnHeader>
								{neutralGroups
									.filter(
										(group) =>
											isMobile ||
											data.likes.given.some(
												(like) => like.groupId === group.id,
											),
									)
									.map((group) => {
										return (
											<GroupCard
												key={group.id}
												group={group}
												action={
													data.likes.given.some(
														(like) => like.groupId === group.id,
													)
														? "UNLIKE"
														: "LIKE"
												}
												showNote
											/>
										);
									})}
							</div>
						</SendouTabPanel>
						<SendouTabPanel id="received">
							<div className="stack sm">
								{!data.ownGroup ? <JoinQueuePrompt /> : null}
								{groupsReceivedLikesFrom.map((group) => {
									const like = data.likes.received.find(
										(l) => l.groupId === group.id,
									)!;

									const action = () => {
										if (!isFullGroup) return "GROUP_UP";

										if (like.isRechallenge) return "MATCH_UP_RECHALLENGE";
										return "MATCH_UP";
									};

									return (
										<GroupCard
											key={group.id}
											group={group}
											action={action()}
											showNote
										/>
									);
								})}
							</div>
						</SendouTabPanel>
						<SendouTabPanel id="own">{ownGroupElement}</SendouTabPanel>
						<SendouTabPanel id="chat">{chatElement}</SendouTabPanel>
					</SendouTabs>
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
						{!data.ownGroup ? <JoinQueuePrompt /> : null}
						{groupsReceivedLikesFrom.map((group) => {
							const like = data.likes.received.find(
								(l) => l.groupId === group.id,
							)!;

							const action = () => {
								if (!isFullGroup) return "GROUP_UP";

								if (like.isRechallenge) return "MATCH_UP_RECHALLENGE";
								return "MATCH_UP";
							};

							return (
								<GroupCard
									key={group.id}
									group={group}
									action={action()}
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
		<LinkButton to={SENDOUQ_PAGE} variant="minimal" size="small">
			{t("q:looking.joinQPrompt")}
		</LinkButton>
	);
}
