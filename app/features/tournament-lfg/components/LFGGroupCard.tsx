import clsx from "clsx";
import { Mic, Star, Volume2, VolumeX } from "lucide-react";
import * as React from "react";
import { Flipped } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Image, WeaponImage } from "~/components/Image";
import { SubmitButton } from "~/components/SubmitButton";
import type { Pronouns } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { IS_Q_LOOKING_MOBILE_BREAKPOINT } from "~/features/sendouq/q-constants";
import { SendouForm } from "~/form/SendouForm";
import { useMainContentWidth } from "~/hooks/useMainContentWidth";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { navIconUrl, userPage } from "~/utils/urls";
import { updateGroupFormSchema } from "../tournament-lfg-schemas";
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
	isStayAsSub: boolean;
	weapons: Array<{ weaponSplId: MainWeaponId; isFavorite: boolean }> | null;
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
	const fetcher = useFetcher();
	const user = useUser();

	const isOwnGroup = group.id === ownGroup?.id;
	const showActions = isOwnGroup && group.usersRole === "OWNER";

	const currentMember = user
		? group.members.find((m) => m.id === user.id)
		: undefined;

	return (
		<LFGGroupCardContainer groupId={group.id} isOwnGroup={isOwnGroup}>
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
					<LFGTeamNote
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
					<fetcher.Form className="stack items-center" method="post">
						<input type="hidden" name="targetTeamId" value={group.id} />
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
		</LFGGroupCardContainer>
	);
}

function LFGGroupCardContainer({
	isOwnGroup,
	groupId,
	children,
}: {
	isOwnGroup: boolean;
	groupId: number;
	children: React.ReactNode;
}) {
	const width = useMainContentWidth();
	const layout = width < IS_Q_LOOKING_MOBILE_BREAKPOINT ? "mobile" : "desktop";

	if (isOwnGroup) return <>{children}</>;

	return <Flipped flipId={`${layout}-${groupId}`}>{children}</Flipped>;
}

function LFGGroupMemberRow({
	member,
	showActions,
}: {
	member: LFGGroupMember;
	showActions: boolean;
	isOwnGroup: boolean;
}) {
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
		</div>
	);
}

function LFGTeamNote({
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
	const { t } = useTranslation(["common", "q"]);
	const [editing, setEditing] = React.useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies(note): when note updates exit editing mode
	// biome-ignore lint/correctness/useExhaustiveDependencies(isStayAsSub): when isStayAsSub updates exit editing mode
	React.useEffect(() => {
		setEditing(false);
	}, [note, isStayAsSub]);

	if (editing) {
		return (
			<LFGEditGroupForm
				note={note}
				isStayAsSub={isStayAsSub}
				memberCount={memberCount}
				stopEditing={() => setEditing(false)}
			/>
		);
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

function LFGEditGroupForm({
	note,
	isStayAsSub,
	memberCount,
	stopEditing,
}: {
	note: string | null;
	isStayAsSub: boolean;
	memberCount: number;
	stopEditing: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouForm
			schema={updateGroupFormSchema}
			defaultValues={{ note: note ?? undefined, stayAsSub: isStayAsSub }}
			submitButtonText={t("common:actions.save")}
			secondarySubmit={
				<SendouButton
					variant="minimal-destructive"
					size="miniscule"
					onPress={stopEditing}
				>
					{t("common:actions.cancel")}
				</SendouButton>
			}
		>
			{({ FormField }) => (
				<>
					<FormField name="note" />
					{memberCount === 1 ? <FormField name="stayAsSub" /> : null}
				</>
			)}
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
	const fetcher = useFetcher();
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
