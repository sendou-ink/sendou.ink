import clsx from "clsx";
import { Edit, Mic, Star, Trash, Volume2, VolumeX } from "lucide-react";
import * as React from "react";
import { ViewTransition } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image, WeaponImage } from "~/components/Image";
import { NoteAvatar } from "~/components/NoteAvatar";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/tournament-context";
import {
	UserCard,
	useUserCardData,
} from "~/features/user-card/components/UserCard";
import { SendouForm } from "~/form/SendouForm";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { navIconUrl } from "~/utils/urls";
import {
	finishUpdateIfUnmoved,
	usePageViewTransitionClass,
} from "~/utils/view-transition";
import {
	lookingSchema,
	updateGroupFormSchema,
} from "../tournament-lfg-schemas";
import styles from "./LFGGroupCard.module.css";

export type LFGGroupMember = {
	id: number;
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customAvatarUrl: string | null;
	customUrl: string | null;
	languages: UnifiedLanguageCode[];
	vc: "YES" | "NO" | "LISTEN_ONLY" | null;
	role: "OWNER" | "MANAGER" | "REGULAR";
	isStayAsSub: boolean;
	weapons: Array<{
		weaponSplId: MainWeaponId;
		isFavorite: boolean;
		isTenStar: boolean;
	}> | null;
	plusTier: number | null;
};

export type LFGGroup = {
	id: number;
	isPlaceholder: boolean;
	teamName: string | null;
	teamAvatarUrl: string | null;
	note: string | null;
	members: LFGGroupMember[];
	usersRole: "OWNER" | "MANAGER" | "REGULAR" | null;
};

export function LFGGroupCard({
	group,
	action,
	ownGroup,
}: {
	group: LFGGroup;
	action?: "LIKE" | "UNLIKE" | "ACCEPT";
	ownGroup?: LFGGroup;
}) {
	const { t } = useTranslation(["common", "q"]);
	const user = useUser();
	const tournament = useTournament();

	const isOwnGroup = group.id === ownGroup?.id;
	const showActions = isOwnGroup && group.usersRole === "OWNER";

	const currentMember = user
		? group.members.find((m) => m.id === user.id)
		: undefined;

	const showOrganizerDelete = !currentMember && tournament.isOrganizer(user);

	return (
		<LFGGroupCardContainer isOwnGroup={isOwnGroup}>
			<section className={styles.group}>
				{group.teamName ? (
					<Divider smallText className={styles.teamHeader}>
						{group.teamAvatarUrl ? (
							<Avatar size="xxs" url={group.teamAvatarUrl} />
						) : null}
						<div className={styles.teamName}>{group.teamName}</div>
					</Divider>
				) : null}
				<div className="stack md">
					{group.members.map((member) => (
						<LFGGroupMemberRow
							key={member.discordId}
							member={member}
							showActions={showActions}
							isOwnGroup={isOwnGroup}
						/>
					))}
				</div>
				{isOwnGroup ? (
					<LFGOwnGroupControls
						key={group.note ?? ""}
						note={group.note}
						editable={group.usersRole === "OWNER"}
						isStayAsSub={currentMember?.isStayAsSub ?? false}
						memberCount={group.members.length}
					/>
				) : group.note ? (
					<div className="text-lighter text-center text-xs mt-1">
						{group.note}
					</div>
				) : null}
				{action &&
				(ownGroup?.usersRole === "OWNER" ||
					ownGroup?.usersRole === "MANAGER") ? (
					<ActionButton
						schema={lookingSchema}
						action={action}
						fields={{ targetTeamId: group.id }}
						formClassName="stack items-center"
						size="small"
						variant={action === "UNLIKE" ? "destructive" : "outlined"}
					>
						{action === "LIKE"
							? t("q:looking.groups.actions.invite")
							: action === "ACCEPT"
								? t("common:actions.accept")
								: t("q:looking.groups.actions.undo")}
					</ActionButton>
				) : null}
				{showOrganizerDelete ? (
					<LFGOrganizerGroupRemover group={group} />
				) : null}
			</section>
		</LFGGroupCardContainer>
	);
}

function LFGOrganizerGroupRemover({ group }: { group: LFGGroup }) {
	const { t } = useTranslation(["common", "q"]);

	const targetUserId = (
		group.members.find((m) => m.role === "OWNER") ?? group.members[0]
	)?.id;

	if (typeof targetUserId !== "number") return null;

	return (
		<div className="stack items-center">
			<FormWithConfirm
				dialogHeading={t("q:looking.groups.actions.organizerRemove.confirm", {
					name: group.teamName ?? group.members[0]?.username,
				})}
				submitButtonText={t("common:actions.delete")}
				fields={[
					["_action", "DELETE_GROUP"],
					["userId", targetUserId],
				]}
			>
				<SendouButton
					variant="minimal-destructive"
					size="small"
					icon={<Trash />}
				>
					{t("common:actions.delete")}
				</SendouButton>
			</FormWithConfirm>
		</div>
	);
}

function LFGGroupCardContainer({
	isOwnGroup,
	children,
}: {
	isOwnGroup: boolean;
	children: React.ReactNode;
}) {
	const updateClass = usePageViewTransitionClass("card-update");

	if (isOwnGroup) return <>{children}</>;

	return (
		<ViewTransition update={updateClass} onUpdate={finishUpdateIfUnmoved}>
			{children}
		</ViewTransition>
	);
}

function LFGGroupMemberRow({
	member,
	showActions,
}: {
	member: LFGGroupMember;
	showActions: boolean;
	isOwnGroup: boolean;
}) {
	const cardData = useUserCardData(member.id);

	return (
		<div className="stack xxs">
			<div className={styles.member}>
				<div className="text-main-forced stack xs horizontal items-center">
					<UserCard userId={member.id} withMutualFriends>
						<span className="stack xs horizontal items-center">
							<NoteAvatar
								sentiment={cardData?.privateNote?.sentiment}
								size="sm"
							>
								<Avatar user={member} size="xs" />
							</NoteAvatar>
							<span className={styles.name}>{member.username}</span>
						</span>
					</UserCard>
				</div>
				<div className="ml-auto stack horizontal sm items-center">
					{showActions || (!showActions && member.role === "OWNER") ? (
						<LFGMemberRoleManager member={member} showActions={showActions} />
					) : null}
				</div>
			</div>
			<div className="stack horizontal justify-between">
				<div className="stack horizontal items-center xxs">
					{member.vc ? (
						<div className={styles.extraInfo}>
							<LFGVoiceChatInfo member={member} />
						</div>
					) : null}
					{member.plusTier ? (
						<div className={styles.extraInfo}>
							<Image path={navIconUrl("plus")} width={20} height={20} alt="" />
							{member.plusTier}
						</div>
					) : null}
				</div>
				{member.weapons && member.weapons.length > 0 ? (
					<div className={styles.extraInfo}>
						{member.weapons.map((weapon) => (
							<WeaponImage key={weapon.weaponSplId} weapon={weapon} size={26} />
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}

function LFGOwnGroupControls({
	note,
	editable,
	isStayAsSub,
	memberCount,
}: {
	note: string | null;
	editable: boolean;
	isStayAsSub: boolean;
	memberCount: number;
}) {
	const { t } = useTranslation(["q"]);
	const [editing, setEditing] = React.useState(false);

	if (editing) {
		return (
			<LFGEditGroupForm note={note} stopEditing={() => setEditing(false)} />
		);
	}

	return (
		<div className="stack sm">
			{note ? (
				<div className="text-lighter text-center text-xs">{note}</div>
			) : null}
			<div className="stack horizontal sm items-center">
				{memberCount === 1 ? (
					<LFGStayAsSubSwitch isStayAsSub={isStayAsSub} />
				) : null}
				{editable ? (
					<SendouButton
						size="miniscule"
						variant="outlined"
						icon={<Edit />}
						onClick={() => setEditing(true)}
						className="ml-auto"
					>
						{note
							? t("q:looking.groups.editNote")
							: t("q:looking.groups.addNote")}
					</SendouButton>
				) : null}
			</div>
		</div>
	);
}

/** Changes the sub preference in place so the group keeps its spot in the list. */
function LFGStayAsSubSwitch({ isStayAsSub }: { isStayAsSub: boolean }) {
	const { t } = useTranslation(["forms"]);
	const { submit, fetcher } = useActionSubmit(lookingSchema, {
		encType: "application/json",
	});

	const submitted = fetcher.json as { stayAsSub: boolean } | undefined;

	return (
		<SendouSwitch
			size="small"
			data-testid="stay-as-sub-switch"
			isSelected={submitted?.stayAsSub ?? isStayAsSub}
			onChange={(stayAsSub) => submit("SET_STAY_AS_SUB", { stayAsSub })}
		>
			{t("forms:labels.stayAsSub")}
		</SendouSwitch>
	);
}

function LFGEditGroupForm({
	note,
	stopEditing,
}: {
	note: string | null;
	stopEditing: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouForm
			schema={updateGroupFormSchema}
			defaultValues={{ note: note ?? undefined }}
			submitButtonText={t("common:actions.save")}
			secondarySubmit={
				<SendouButton
					variant="minimal-destructive"
					size="miniscule"
					onClick={stopEditing}
				>
					{t("common:actions.cancel")}
				</SendouButton>
			}
		>
			{({ FormField }) => <FormField name="note" />}
		</SendouForm>
	);
}

function LFGMemberRoleManager({
	member,
	showActions,
}: {
	member: Pick<LFGGroupMember, "id" | "role">;
	showActions: boolean;
}) {
	const { t } = useTranslation(["q"]);
	const isFilled = member.role === "OWNER";

	if (!showActions && member.role !== "OWNER") return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					size="miniscule"
					icon={
						<Star
							className={clsx(styles.star, {
								[styles.starInactive]: member.role === "REGULAR",
							})}
							fill={isFilled ? "currentColor" : "none"}
						/>
					}
				/>
			}
		>
			<div className="stack sm items-center">
				<div>{t(`q:roles.${member.role}`)}</div>
				{member.role !== "OWNER" && showActions ? (
					<div className="stack md items-center">
						{member.role === "REGULAR" ? (
							<ActionButton
								schema={lookingSchema}
								action="GIVE_MANAGER"
								fields={{ userId: member.id }}
								variant="outlined"
								size="small"
							>
								{t("q:looking.groups.actions.giveManager")}
							</ActionButton>
						) : null}
						{member.role === "MANAGER" ? (
							<ActionButton
								schema={lookingSchema}
								action="REMOVE_MANAGER"
								fields={{ userId: member.id }}
								variant="destructive"
								size="small"
							>
								{t("q:looking.groups.actions.removeManager")}
							</ActionButton>
						) : null}
					</div>
				) : null}
			</div>
		</SendouPopover>
	);
}

function LFGVoiceChatInfo({
	member,
}: {
	member: Pick<LFGGroupMember, "id" | "vc" | "languages">;
}) {
	const user = useUser();
	const { t } = useTranslation(["q"]);

	if (!member.languages || !member.vc) return null;

	const Icon =
		member.vc === "YES" ? Mic : member.vc === "LISTEN_ONLY" ? Volume2 : VolumeX;

	const color = () => {
		const languagesMatch =
			member.id === user?.id ||
			member.languages?.some((l) => user?.languages.includes(l));

		if (!languagesMatch) return "text-error";

		return member.vc === "YES"
			? "text-success"
			: member.vc === "LISTEN_ONLY"
				? "text-warning"
				: "text-error";
	};

	const languageToFull = (code: string) =>
		languagesUnified.find((l) => l.code === code)?.name ?? "";

	const languagesString =
		member.languages.length > 0
			? `(${member.languages.map(languageToFull).join(", ")})`
			: null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					size="miniscule"
					icon={<Icon className={clsx(styles.vcIcon, color())} />}
				/>
			}
		>
			{t(`q:vc.${member.vc}`)} {languagesString}
		</SendouPopover>
	);
}
