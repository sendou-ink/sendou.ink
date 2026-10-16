import { Mic, Trash } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Avatar } from "~/components/Avatar";
import { EmptyState } from "~/components/EmptyState";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouPopover } from "~/components/elements/Popover";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { WeaponImage } from "~/components/Image";
import { NoteAvatar } from "~/components/NoteAvatar";
import { useUser } from "~/features/auth/core/user";
import {
	LookingColumns,
	SortedCard,
} from "~/features/sendouq/components/LookingColumns";
import { useTournament } from "~/features/tournament/tournament-context";
import {
	UserCard,
	useUserCardData,
} from "~/features/user-card/components/UserCard";
import { privateNoteSentimentScore } from "~/features/user-card/user-card-utils";
import { SendouForm } from "~/form/SendouForm";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { LFGGroupCard } from "../components/LFGGroupCard";
import {
	type LookingLoaderData,
	loader,
	type SubEntry,
} from "../loaders/to.$id.looking.server";
import {
	addSubFormSchema,
	joinQueueFormSchema,
	lookingSchema,
} from "../tournament-lfg-schemas";
import styles from "./to.$id.looking.module.css";

export { action } from "../actions/to.$id.looking.server";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["q", "tournament", "forms", "common", "user"],
};

export default function TournamentLFGPage() {
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
	const tournament = useTournament();

	const ownMemberCount =
		data.ownGroup?.members.length ?? data.ownTeam?.members.length ?? 0;
	const availableSlots = tournament.maxMembersPerTeam - ownMemberCount;

	const compatibleGroups = data.groups
		.filter((group) => group.members.length <= availableSlots)
		.toSorted(
			(a, b) =>
				privateNoteSentimentScore(b.members, data.userCards) -
				privateNoteSentimentScore(a.members, data.userCards),
		);
	const sortIndexes = new Map(
		compatibleGroups.map((group, index) => [group.id, index]),
	);

	const likedGroupIds = new Set(data.likes.given.map((like) => like.teamId));
	const receivedLikeGroupIds = new Set(
		data.likes.received.map((like) => like.teamId),
	);

	const neutralGroups = compatibleGroups.filter(
		(group) =>
			!likedGroupIds.has(group.id) && !receivedLikeGroupIds.has(group.id),
	);
	const likedGroups = compatibleGroups.filter(
		(group) =>
			likedGroupIds.has(group.id) && !receivedLikeGroupIds.has(group.id),
	);
	const groupsReceivedLikesFrom = compatibleGroups.filter((group) =>
		receivedLikeGroupIds.has(group.id),
	);

	const sortedGroupCard = (
		group: (typeof compatibleGroups)[number],
		action: "LIKE" | "UNLIKE",
	) => (
		<SortedCard key={group.id} sortIndex={sortIndexes.get(group.id)!}>
			<LFGGroupCard
				group={group}
				action={action}
				ownGroup={data.ownGroup ?? undefined}
			/>
		</SortedCard>
	);

	return (
		<LookingColumns
			flipKey={data}
			own={{
				memberCount: ownMemberCount,
				content: data.ownGroup ? (
					<div className="stack md">
						<LFGGroupCard group={data.ownGroup} ownGroup={data.ownGroup} />
						<LFGGroupLeaver />
					</div>
				) : data.ownTeam ? (
					<TeamQueueSection />
				) : (
					<JoinQueueForm />
				),
			}}
			invited={
				data.ownGroup
					? likedGroups.map((group) => sortedGroupCard(group, "UNLIKE"))
					: null
			}
			available={neutralGroups.map((group) => sortedGroupCard(group, "LIKE"))}
			availableCount={neutralGroups.length}
			received={groupsReceivedLikesFrom.map((group) => (
				<LFGGroupCard
					key={group.id}
					group={group}
					action="ACCEPT"
					ownGroup={data.ownGroup ?? undefined}
				/>
			))}
			receivedCount={groupsReceivedLikesFrom.length}
		/>
	);
}

function SubsView({
	data,
}: {
	data: Extract<LookingLoaderData, { mode: "subs" }>;
}) {
	const { t } = useTranslation(["tournament"]);
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
			{data.subs.length > 0 ? (
				data.subs.map((sub) => <SubCard key={sub.userId} sub={sub} />)
			) : (
				<EmptyState navItem="lfg">{t("tournament:subs.noPosts")}</EmptyState>
			)}
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
	const cardData = useUserCardData(sub.userId);

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
				<div className={styles.subsSectionAvatar}>
					<UserCard userId={sub.userId} withMutualFriends>
						<NoteAvatar sentiment={cardData?.privateNote?.sentiment} size="sm">
							<Avatar user={{ ...sub, id: sub.userId }} size="sm" />
						</NoteAvatar>
					</UserCard>
				</div>
				<div className={styles.subsSectionName}>
					<UserCard userId={sub.userId} withMutualFriends>
						<span>{sub.username}</span>
					</UserCard>
				</div>
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
					<ActionButton
						schema={lookingSchema}
						action="JOIN_QUEUE"
						formClassName="stack items-center"
						variant="outlined"
					>
						{t("q:looking.joinQPromptMembers")}
					</ActionButton>
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
