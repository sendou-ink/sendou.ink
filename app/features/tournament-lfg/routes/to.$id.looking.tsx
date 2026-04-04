import clsx from "clsx";
import { Mic, Trash } from "lucide-react";
import * as React from "react";
import { Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouPopover } from "~/components/elements/Popover";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { WeaponImage } from "~/components/Image";
import { Placeholder } from "~/components/Placeholder";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { IS_Q_LOOKING_MOBILE_BREAKPOINT } from "~/features/sendouq/q-constants";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { SendouForm } from "~/form/SendouForm";
import { useHydrated } from "~/hooks/useHydrated";
import { useMainContentWidth } from "~/hooks/useMainContentWidth";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { userPage } from "~/utils/urls";
import { LFGGroupCard } from "../components/LFGGroupCard";
import {
	type LookingLoaderData,
	loader,
	type SubEntry,
} from "../loaders/to.$id.looking.server";
import {
	addSubFormSchema,
	joinQueueFormSchema,
} from "../tournament-lfg-schemas";

export { action } from "../actions/to.$id.looking.server";
export { loader };

import styles from "./to.$id.looking.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["q", "tournament", "forms", "common"],
};

export default function TournamentLFGShell() {
	const isHydrated = useHydrated();

	if (!isHydrated) return <Placeholder />;

	return <TournamentLFGPage />;
}

function TournamentLFGPage() {
	const data = useLoaderData<typeof loader>();
	if (data.mode === "subs") {
		return <SubsView data={data} />;
	}

	return <GroupsView data={data} />;
}

function GroupsView({
	data,
}: {
	data: Extract<LookingLoaderData, { mode: "looking" }>;
}) {
	const { t } = useTranslation(["q"]);
	const tournament = useTournament();
	const width = useMainContentWidth();

	const isMobile = width < IS_Q_LOOKING_MOBILE_BREAKPOINT;

	const ownMemberCount =
		data.ownGroup?.members.length ?? data.ownTeam?.members.length ?? 0;
	const availableSlots = tournament.maxMembersPerTeam - ownMemberCount;

	const compatibleGroups = data.groups.filter(
		(group) => group.members.length <= availableSlots,
	);

	const neutralGroups = compatibleGroups.filter(
		(group) =>
			!data.likes.given.some((like) => like.teamId === group.id) &&
			!data.likes.received.some((like) => like.teamId === group.id),
	);
	const likedGroups = compatibleGroups.filter((group) =>
		data.likes.given.some((like) => like.teamId === group.id),
	);
	const groupsReceivedLikesFrom = compatibleGroups.filter((group) =>
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

	const ownTabMemberCount = data.ownGroup
		? data.ownGroup.members.length
		: data.ownTeam
			? data.ownTeam.members.length
			: 0;

	const ownGroupElement = data.ownGroup ? (
		<div className="stack md">
			<LFGGroupCard group={data.ownGroup} ownGroup={data.ownGroup} />
			<LFGGroupLeaver />
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
								<SendouTab id="own" number={ownTabMemberCount}>
									{t("q:looking.columns.myGroup")}
								</SendouTab>
							</SendouTabList>
							<SendouTabPanel id="own">{leftColumnContent}</SendouTabPanel>
						</SendouTabs>
					</div>
				) : null}
				<div className={styles.innerContainer}>
					<SendouTabs>
						<SendouTabList>
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
									? compatibleGroups.filter(
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

function SubsView({
	data,
}: {
	data: Extract<LookingLoaderData, { mode: "subs" }>;
}) {
	const user = useUser();
	const tournament = useTournament();

	const isOnTeam = Boolean(tournament.teamMemberOfByUser(user));

	return (
		<div className={styles.subsContainer}>
			{tournament.canAddNewSubPost &&
			!data.hasOwnSubPost &&
			user &&
			!isOnTeam ? (
				<AddSubForm />
			) : null}
			{data.subs.map((sub) => (
				<SubCard key={sub.userId} sub={sub} />
			))}
		</div>
	);
}

function AddSubForm() {
	const { t } = useTranslation(["tournament"]);

	return (
		<div className="stack items-end">
			<SendouDialog
				heading={t("tournament:subs.addPost")}
				showCloseButton
				trigger={
					<SendouButton size="small">
						{t("tournament:subs.addPost")}
					</SendouButton>
				}
			>
				<SendouForm schema={addSubFormSchema}>
					{({ FormField }) => <FormField name="message" />}
				</SendouForm>
			</SendouDialog>
		</div>
	);
}

function SubCard({ sub }: { sub: SubEntry }) {
	const { t } = useTranslation(["common", "tournament"]);
	const user = useUser();
	const tournament = useTournament();

	const infos = [
		<div key="vc" className={styles.subsInfoVc}>
			<Mic
				className={
					sub.vc === "YES"
						? "text-success"
						: sub.vc === "LISTEN_ONLY"
							? "text-warning"
							: "text-error"
				}
			/>
			{sub.vc === "YES"
				? t("tournament:subs.canVC")
				: sub.vc === "LISTEN_ONLY"
					? t("tournament:subs.listenOnlyVC")
					: t("tournament:subs.noVC")}
		</div>,
	];
	if (sub.plusTier) {
		infos.push(
			<React.Fragment key="dot-1">{"\u00B7"}</React.Fragment>,
			<div key="plus">+{sub.plusTier}</div>,
		);
	}
	if (sub.languages.length > 0) {
		infos.push(
			<React.Fragment key="dot-2">{"\u00B7"}</React.Fragment>,
			<div key="languages">
				{sub.languages.map((lang) => lang.toUpperCase()).join(" / ")}
			</div>,
		);
	}

	return (
		<div>
			<section className={styles.subsSection}>
				<Avatar user={sub} size="sm" className={styles.subsSectionAvatar} />
				<Link to={userPage(sub)} className={styles.subsSectionName}>
					{sub.username}
				</Link>
				<div className={styles.subsSectionInfo}>{infos}</div>
				{sub.weapons ? (
					<div className={styles.subsSectionWeapons}>
						<div className={styles.subsSectionWeaponText}>
							{t("tournament:subs.prefersToPlay")}
						</div>
						<div className={styles.subsSectionWeaponImages}>
							{sub.weapons.map((wpn) => (
								<WeaponImage
									key={wpn.weaponSplId}
									weaponSplId={wpn.weaponSplId}
									size={32}
									variant="badge"
								/>
							))}
						</div>
					</div>
				) : null}
				{sub.message ? (
					<div className={styles.subsSectionMessage}>{sub.message}</div>
				) : null}
			</section>
			{user?.id === sub.userId || tournament.isOrganizer(user) ? (
				<div className="stack mt-1 items-end">
					<FormWithConfirm
						dialogHeading={
							user?.id === sub.userId
								? "Delete your sub post?"
								: `Delete sub post by ${sub.username}?`
						}
						fields={[
							["_action", "DELETE_SUB"],
							["userId", sub.userId],
						]}
					>
						<SendouButton
							variant="minimal-destructive"
							size="small"
							type="submit"
							icon={<Trash />}
						>
							{t("common:actions.delete")}
						</SendouButton>
					</FormWithConfirm>
				</div>
			) : null}
		</div>
	);
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
	const width = useMainContentWidth();

	const isMobile = width < IS_Q_LOOKING_MOBILE_BREAKPOINT;

	if (isMobile) return null;

	return <div className={styles.header}>{children}</div>;
}

function JoinQueueForm() {
	const { t } = useTranslation(["q"]);

	return (
		<SendouForm
			schema={joinQueueFormSchema}
			submitButtonText={t("q:looking.joinQPromptTeam")}
		>
			{({ FormField }) => (
				<>
					<FormField name="note" />
					<FormField name="stayAsSub" />
				</>
			)}
		</SendouForm>
	);
}

function TeamQueueSection() {
	const { t } = useTranslation(["q", "tournament"]);
	const data = useLoaderData<typeof loader>() as Extract<
		LookingLoaderData,
		{ mode: "looking" }
	>;
	const tournament = useTournament();
	const fetcher = useFetcher();

	if (!data.ownTeam) return null;

	const isAtMaxMembers =
		data.ownTeam.members.length >= tournament.maxMembersPerTeam;
	const canJoinQueue =
		data.ownTeam.usersRole === "OWNER" || data.ownTeam.usersRole === "MANAGER";

	return (
		<div className="stack md">
			<LFGGroupCard group={data.ownTeam} />
			{!isAtMaxMembers ? (
				canJoinQueue ? (
					<fetcher.Form method="post" className="stack items-center">
						<SubmitButton
							_action="JOIN_QUEUE"
							state={fetcher.state}
							variant="outlined"
						>
							{t("q:looking.joinQPromptMembers")}
						</SubmitButton>
					</fetcher.Form>
				) : (
					<div className="stack items-center">
						<SendouPopover
							trigger={
								<SendouButton variant="outlined">
									{t("q:looking.joinQPromptMembers")}
								</SendouButton>
							}
						>
							{t("tournament:lfg.askCaptainToJoinQueue")}
						</SendouPopover>
					</div>
				)
			) : null}
		</div>
	);
}

function LFGGroupLeaver() {
	const { t } = useTranslation(["q"]);

	return (
		<FormWithConfirm
			dialogHeading={t("q:looking.groups.actions.stopLooking.confirm")}
			fields={[["_action", "LEAVE_GROUP"]]}
			submitButtonText={t("q:looking.groups.actions.stopLooking")}
		>
			<SendouButton variant="minimal-destructive" size="small">
				{t("q:looking.groups.actions.stopLooking")}
			</SendouButton>
		</FormWithConfirm>
	);
}
