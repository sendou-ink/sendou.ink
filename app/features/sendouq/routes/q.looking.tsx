import type { MetaFunction } from "@remix-run/node";
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
import { Chat, useChat } from "~/features/chat/components/Chat";
import { useAutoRefresh } from "~/hooks/useAutoRefresh";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useWindowSize } from "~/hooks/useWindowSize";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_SETTINGS_PAGE,
	SENDOUQ_STREAMS_PAGE,
	navIconUrl,
} from "~/utils/urls";
import { GroupCard } from "../components/GroupCard";
import { GroupLeaver } from "../components/GroupLeaver";
import { MemberAdder } from "../components/MemberAdder";
import { FULL_GROUP_SIZE } from "../q-constants";
import type { LookingGroupWithInviteCode } from "../q-types";

import { action } from "../actions/q.looking.server";
import { loader } from "../loaders/q.looking.server";
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
