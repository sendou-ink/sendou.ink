import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Image, WeaponImage } from "~/components/Image";
import { MicrophoneIcon } from "~/components/icons/Microphone";
import { SpeakerIcon } from "~/components/icons/Speaker";
import { SpeakerXIcon } from "~/components/icons/SpeakerX";
import { StarIcon } from "~/components/icons/Star";
import { StarFilledIcon } from "~/components/icons/StarFilled";
import { SubmitButton } from "~/components/SubmitButton";
import type { Pronouns } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { navIconUrl, userPage } from "~/utils/urls";
import { TOURNAMENT_LFG } from "../tournament-lfg-constants";
import styles from "./LFGGroupCard.module.css";

export type LFGGroupMember = {
	id: number;
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customUrl: string | null;
	languages: string[];
	vc: "YES" | "NO" | "LISTEN_ONLY" | null;
	pronouns: Pronouns | null;
	role: "OWNER" | "MANAGER" | "REGULAR";
	note: string | null;
	isStayAsSub: boolean;
	weapons: Array<{ weaponSplId: MainWeaponId; isFavorite: boolean }> | null;
	chatNameColor: string | null;
	plusTier: number | null;
};

export type LFGGroup = {
	id: number;
	tournamentTeamId: number | null;
	teamName: string | null;
	teamAvatarUrl: string | null;
	members: LFGGroupMember[];
	usersRole: "OWNER" | "MANAGER" | "REGULAR" | null;
};

// xxx: "cancel" & "save" buttons off
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
	const fetcher = useFetcher();

	const isOwnGroup = group.id === ownGroup?.id;
	const showActions = isOwnGroup && group.usersRole === "OWNER";

	return (
		<section className={styles.group}>
			{/* {group.teamName ? (
				<div className={styles.teamHeader}>
					{group.teamAvatarUrl ? (
						<Avatar size="xxs" url={group.teamAvatarUrl} />
					) : null}
					<div className={styles.teamName}>{group.teamName}</div>
				</div>
			) : null} */}
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
			{action &&
			(ownGroup?.usersRole === "OWNER" || ownGroup?.usersRole === "MANAGER") ? (
				<fetcher.Form className="stack items-center" method="post">
					<input type="hidden" name="targetGroupId" value={group.id} />
					<SubmitButton
						size="small"
						variant={action === "UNLIKE" ? "destructive" : "outlined"}
						_action={action}
						state={fetcher.state}
					>
						{action === "LIKE"
							? t("q:looking.groups.actions.invite")
							: action === "ACCEPT"
								? t("common:actions.accept")
								: t("q:looking.groups.actions.undo")}
					</SubmitButton>
				</fetcher.Form>
			) : null}
		</section>
	);
}

function LFGGroupMemberRow({
	member,
	showActions,
	isOwnGroup,
}: {
	member: LFGGroupMember;
	showActions: boolean;
	isOwnGroup: boolean;
}) {
	const user = useUser();

	return (
		<div className="stack xxs">
			<div className={styles.member}>
				<div className="text-main-forced stack xs horizontal items-center">
					<Avatar user={member} size="xs" />
					<Link to={userPage(member)} className={styles.name}>
						{member.username}
					</Link>
					{member.pronouns ? (
						<span className="text-lighter ml-1 text-xxxs">
							{member.pronouns.subject}/{member.pronouns.object}
						</span>
					) : null}
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
							<WeaponImage
								key={weapon.weaponSplId}
								weaponSplId={weapon.weaponSplId}
								variant={weapon.isFavorite ? "badge-5-star" : "badge"}
								size={26}
							/>
						))}
					</div>
				) : null}
			</div>
			{isOwnGroup ? (
				<LFGMemberNote note={member.note} editable={user?.id === member.id} />
			) : null}
		</div>
	);
}

function LFGMemberNote({
	note,
	editable,
}: {
	note: string | null;
	editable: boolean;
}) {
	const { t } = useTranslation(["common", "q"]);
	const [editing, setEditing] = React.useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies(note): when note updates exit editing mode
	React.useEffect(() => {
		setEditing(false);
	}, [note]);

	if (editing) {
		return <LFGAddNoteForm note={note} stopEditing={() => setEditing(false)} />;
	}

	if (note) {
		return (
			<div className="text-lighter text-center text-xs mt-1">
				{note}{" "}
				{editable ? (
					<SendouButton
						size="miniscule"
						variant="minimal"
						onPress={() => setEditing(true)}
						className="mt-2 ml-auto"
					>
						{t("q:looking.groups.editNote")}
					</SendouButton>
				) : null}
			</div>
		);
	}

	if (!editable) return null;

	return (
		<SendouButton
			variant="minimal"
			size="miniscule"
			onPress={() => setEditing(true)}
		>
			{t("q:looking.groups.addNote")}
		</SendouButton>
	);
}

function LFGAddNoteForm({
	note,
	stopEditing,
}: {
	note: string | null;
	stopEditing: () => void;
}) {
	const fetcher = useFetcher();
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const { t } = useTranslation(["common"]);
	const [value, setValue] = React.useState(note ?? "");

	const newValueLegal = value.length <= TOURNAMENT_LFG.PUBLIC_NOTE_MAX_LENGTH;

	React.useEffect(() => {
		if (!textareaRef.current) return;
		textareaRef.current.focus();
		textareaRef.current.selectionStart = textareaRef.current.selectionEnd =
			textareaRef.current.value.length;
	}, []);

	return (
		<fetcher.Form method="post">
			<textarea
				value={value}
				onChange={(e) => setValue(e.target.value)}
				rows={2}
				className={`${styles.noteTextarea} mt-1`}
				name="value"
				ref={textareaRef}
			/>
			<div className="stack horizontal justify-between">
				<SendouButton
					variant="minimal-destructive"
					size="miniscule"
					onPress={stopEditing}
				>
					{t("common:actions.cancel")}
				</SendouButton>
				{newValueLegal ? (
					<SubmitButton
						_action="UPDATE_NOTE"
						variant="minimal"
						size="miniscule"
					>
						{t("common:actions.save")}
					</SubmitButton>
				) : (
					<span className="text-warning text-xxs font-semi-bold">
						{value.length}/{TOURNAMENT_LFG.PUBLIC_NOTE_MAX_LENGTH}
					</span>
				)}
			</div>
		</fetcher.Form>
	);
}

function LFGMemberRoleManager({
	member,
	showActions,
}: {
	member: Pick<LFGGroupMember, "id" | "role">;
	showActions: boolean;
}) {
	const fetcher = useFetcher();
	const { t } = useTranslation(["q"]);
	const Icon = member.role === "OWNER" ? StarFilledIcon : StarIcon;

	if (!showActions && member.role !== "OWNER") return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					icon={
						<Icon
							className={clsx(styles.star, {
								[styles.starInactive]: member.role === "REGULAR",
							})}
						/>
					}
				/>
			}
		>
			<div className="stack sm items-center">
				<div>{t(`q:roles.${member.role}`)}</div>
				{member.role !== "OWNER" && showActions ? (
					<fetcher.Form method="post" className="stack md items-center">
						<input type="hidden" name="userId" value={member.id} />
						{member.role === "REGULAR" ? (
							<SubmitButton
								variant="outlined"
								size="small"
								_action="GIVE_MANAGER"
								state={fetcher.state}
							>
								{t("q:looking.groups.actions.giveManager")}
							</SubmitButton>
						) : null}
						{member.role === "MANAGER" ? (
							<SubmitButton
								variant="destructive"
								size="small"
								_action="REMOVE_MANAGER"
								state={fetcher.state}
							>
								{t("q:looking.groups.actions.removeManager")}
							</SubmitButton>
						) : null}
					</fetcher.Form>
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
		member.vc === "YES"
			? MicrophoneIcon
			: member.vc === "LISTEN_ONLY"
				? SpeakerIcon
				: SpeakerXIcon;

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
					size="small"
					icon={<Icon className={clsx(styles.vcIcon, color())} />}
				/>
			}
		>
			{t(`q:vc.${member.vc}`)} {languagesString}
		</SendouPopover>
	);
}
