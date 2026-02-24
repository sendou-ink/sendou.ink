import clsx from "clsx";
import type * as React from "react";
import { Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Placeholder } from "~/components/Placeholder";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouForm } from "~/form/SendouForm";
import { useAutoRefresh } from "~/hooks/useAutoRefresh";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useWindowSize } from "~/hooks/useWindowSize";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { LFGGroupCard } from "../components/LFGGroupCard";
import type { loader } from "../loaders/to.$id.looking.server";
import { joinQueueFormSchema } from "../tournament-lfg-schemas";

export { action } from "../actions/to.$id.looking.server";
export { loader } from "../loaders/to.$id.looking.server";

import styles from "./to.$id.looking.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["q", "tournament", "forms"],
};

export default function TournamentLFGShell() {
	const isMounted = useIsMounted();

	if (!isMounted) return <Placeholder />;

	return <TournamentLFGPage />;
}

// xxx: show one button to join at the top with dialog opening? instead of two inline
// xxx: no button if already in the tournament
// xxx: can we reuse the column layout with sendouq?
function TournamentLFGPage() {
	const data = useLoaderData<typeof loader>();
	useAutoRefresh(data.lastUpdated);

	return <Groups />;
}

function Groups() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const { width } = useWindowSize();

	const isMobile = width < 750;

	const neutralGroups = data.groups.filter(
		(group) =>
			!data.likes.given.some((like) => like.teamId === group.id) &&
			!data.likes.received.some((like) => like.teamId === group.id),
	);
	const likedGroups = data.groups.filter((group) =>
		data.likes.given.some((like) => like.teamId === group.id),
	);
	const groupsReceivedLikesFrom = data.groups.filter((group) =>
		data.likes.received.some((like) => like.teamId === group.id),
	);

	const flipKey = `${neutralGroups.map((g) => `${g.id}-${isMobile ? true : data.likes.given.some((l) => l.teamId === g.id)}`).join(":")}:${groupsReceivedLikesFrom.map((g) => g.id).join(":")}`;

	const invitedGroupsDesktop = (
		<div className="stack sm">
			<ColumnHeader>{t("q:looking.columns.invited")}</ColumnHeader>
			{likedGroups.map((group) => (
				<LFGGroupCard
					key={group.id}
					group={group}
					action="UNLIKE"
					ownGroup={data.ownGroup ?? undefined}
				/>
			))}
		</div>
	);

	const hasOwnSection = data.ownGroup ?? data.ownTeam;
	const ownTabMemberCount = data.ownGroup
		? data.ownGroup.members.length
		: data.ownTeam
			? data.ownTeam.members.length
			: 0;

	const ownGroupElement = data.ownGroup ? (
		<div className="stack md">
			<LFGGroupCard group={data.ownGroup} ownGroup={data.ownGroup} />
			<LFGGroupLeaver
				type={data.ownGroup.members.length === 1 ? "LEAVE_Q" : "LEAVE_GROUP"}
			/>
			{!isMobile ? invitedGroupsDesktop : null}
		</div>
	) : null;

	const leftColumnContent = data.ownGroup ? (
		ownGroupElement
	) : data.ownTeam ? (
		<TeamQueueSection />
	) : (
		<JoinQueueForm />
	);

	return (
		<Flipper flipKey={flipKey}>
			<div
				className={clsx(styles.container, {
					[styles.containerMobile]: isMobile,
				})}
			>
				{!isMobile ? (
					<div>
						<SendouTabs>
							<SendouTabList>
								{hasOwnSection ? (
									<SendouTab id="own" number={ownTabMemberCount}>
										{t("q:looking.columns.myGroup")}
									</SendouTab>
								) : null}
							</SendouTabList>
							<SendouTabPanel id="own">{leftColumnContent}</SendouTabPanel>
						</SendouTabs>
					</div>
				) : null}
				<div className={styles.innerContainer}>
					<SendouTabs>
						<SendouTabList scrolling={isMobile}>
							<SendouTab id="groups" number={neutralGroups.length}>
								{t("q:looking.columns.groups")}
							</SendouTab>
							{isMobile ? (
								<SendouTab
									id="received"
									number={groupsReceivedLikesFrom.length}
								>
									{t("q:looking.columns.invitations")}
								</SendouTab>
							) : null}
							{isMobile ? (
								<SendouTab id="own" number={ownTabMemberCount}>
									{t("q:looking.columns.myGroup")}
								</SendouTab>
							) : null}
						</SendouTabList>
						<SendouTabPanel id="groups">
							<div className="stack sm">
								<ColumnHeader>{t("q:looking.columns.available")}</ColumnHeader>
								{(isMobile
									? data.groups.filter(
											(group) =>
												!data.likes.received.some(
													(like) => like.teamId === group.id,
												),
										)
									: neutralGroups
								).map((group) => (
									<LFGGroupCard
										key={group.id}
										group={group}
										action={
											data.likes.given.some((like) => like.teamId === group.id)
												? "UNLIKE"
												: "LIKE"
										}
										ownGroup={data.ownGroup ?? undefined}
									/>
								))}
							</div>
						</SendouTabPanel>
						<SendouTabPanel id="received">
							<div className="stack sm">
								{groupsReceivedLikesFrom.map((group) => (
									<LFGGroupCard
										key={group.id}
										group={group}
										action="ACCEPT"
										ownGroup={data.ownGroup ?? undefined}
									/>
								))}
							</div>
						</SendouTabPanel>
						<SendouTabPanel id="own">{leftColumnContent}</SendouTabPanel>
					</SendouTabs>
				</div>
				{!isMobile ? (
					<div className="stack sm">
						<ColumnHeader>{t("q:looking.columns.invitations")}</ColumnHeader>
						{groupsReceivedLikesFrom.map((group) => (
							<LFGGroupCard
								key={group.id}
								group={group}
								action="ACCEPT"
								ownGroup={data.ownGroup ?? undefined}
							/>
						))}
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

	return <div className={styles.header}>{children}</div>;
}

function JoinQueueForm() {
	const { t } = useTranslation(["q"]);

	return (
		<SendouForm
			schema={joinQueueFormSchema}
			submitButtonText={t("q:looking.joinQPrompt")}
		>
			{({ FormField }) => <FormField name="stayAsSub" />}
		</SendouForm>
	);
}

function TeamQueueSection() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();

	if (!data.ownTeam) return null;

	return (
		<div className="stack md">
			<LFGGroupCard group={data.ownTeam} />
			<fetcher.Form method="post" className="stack items-center">
				<SubmitButton
					_action="JOIN_QUEUE"
					state={fetcher.state}
					variant="outlined"
				>
					{t("q:looking.joinQPrompt")}
				</SubmitButton>
			</fetcher.Form>
		</div>
	);
}

function LFGGroupLeaver({ type }: { type: "LEAVE_GROUP" | "LEAVE_Q" }) {
	const { t } = useTranslation(["q"]);
	const fetcher = useFetcher();

	if (type === "LEAVE_GROUP") {
		return (
			<FormWithConfirm
				dialogHeading="Leave this group?"
				fields={[["_action", "LEAVE_GROUP"]]}
				submitButtonText="Leave"
			>
				<SendouButton variant="minimal-destructive" size="small">
					{t("q:looking.groups.actions.leaveGroup")}
				</SendouButton>
			</FormWithConfirm>
		);
	}

	return (
		<fetcher.Form method="POST">
			<SubmitButton
				_action="LEAVE_GROUP"
				variant="minimal-destructive"
				size="small"
				state={fetcher.state}
			>
				{t("q:looking.groups.actions.leaveQ")}
			</SubmitButton>
		</fetcher.Form>
	);
}
