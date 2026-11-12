import clsx from "clsx";
import {
	CalendarDays,
	Crown,
	LogOut,
	Menu,
	SquarePen,
	Star,
	Swords,
	Trash2,
	Users,
	Wrench,
} from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Link, useMatches } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { WeaponImage } from "~/components/Image";
import { NoteAvatar } from "~/components/NoteAvatar";
import { Placement } from "~/components/Placement";
import { useUser } from "~/features/auth/core/user";
import type { TeamLoaderData } from "~/features/team/loaders/t.$customUrl.server";
import {
	UserCard,
	useUserCardData,
} from "~/features/user-card/components/UserCard";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useHasPermission } from "~/modules/permissions/hooks";
import { invariant } from "~/utils/invariant";
import {
	editTeamPage,
	manageTeamRosterPage,
	teamResultsPage,
	teamSchedulePage,
} from "~/utils/urls";
import { action } from "../actions/t.$customUrl.index.server";
import type * as TeamRepository from "../TeamRepository.server";
import { teamProfilePageActionSchema } from "../team-schemas";
import {
	getMemberRoleType,
	isTeamMember,
	isTeamOwner,
	resolveNewOwner,
} from "../team-utils";
import styles from "./t.$customUrl.index.module.css";

export { action };

export default function TeamIndexPage() {
	const { t } = useTranslation(["team"]);
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as TeamLoaderData;

	const members = layoutData.team.members;
	const playerMembers = members.filter(
		(member) => getMemberRoleType(member) !== "OTHER",
	);
	const otherMembers = members.filter(
		(member) => getMemberRoleType(member) === "OTHER",
	);
	const showSections = playerMembers.length > 0 && otherMembers.length > 0;

	const renderMember = (member: (typeof members)[number]) => (
		<React.Fragment key={member.id}>
			<MemberRow member={member} number={members.indexOf(member)} />
			<MobileMemberCard member={member} />
		</React.Fragment>
	);

	return (
		<div className="stack lg">
			<ActionButtons />
			{layoutData.results ? (
				<ResultsBanner
					customUrl={layoutData.team.customUrl}
					results={layoutData.results}
				/>
			) : null}
			{layoutData.team.bio ? (
				<article data-testid="team-bio">{layoutData.team.bio}</article>
			) : null}
			{showSections ? (
				<SendouTabs keepPanelsMounted>
					<SendouTabList>
						<SendouTab
							id="players"
							icon={<Swords />}
							number={playerMembers.length}
						>
							{t("team:roster.sections.players")}
						</SendouTab>
						<SendouTab
							id="other"
							icon={<Wrench />}
							number={otherMembers.length}
						>
							{t("team:roster.sections.other")}
						</SendouTab>
					</SendouTabList>
					<SendouTabPanel id="players">
						<div className="stack lg">{playerMembers.map(renderMember)}</div>
					</SendouTabPanel>
					<SendouTabPanel id="other">
						<div className="stack lg">{otherMembers.map(renderMember)}</div>
					</SendouTabPanel>
				</SendouTabs>
			) : (
				<div className="stack lg">{members.map(renderMember)}</div>
			)}
		</div>
	);
}

function ActionButtons() {
	const { t } = useTranslation(["team"]);
	const user = useUser();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as TeamLoaderData;
	const team = layoutData.team;
	const canManageRoster = useHasPermission(team, "MANAGE_ROSTER");
	const canEditTeam = useHasPermission(team, "EDIT");
	const isMember = isTeamMember({ user, team });
	if (!isMember && !canManageRoster && !canEditTeam) {
		return null;
	}

	return (
		<div
			className={clsx(styles.actionButtons, {
				[styles.actionButtonsBesideAvatar]: team.avatarUrl,
			})}
		>
			{isMember ? (
				<LinkButton
					size="small"
					to={teamSchedulePage(team.customUrl)}
					variant="outlined"
					prefetch="intent"
					preventScrollReset
					icon={<CalendarDays />}
					testId="team-schedule-button"
				>
					{t("team:actionButtons.schedule")}
				</LinkButton>
			) : null}
			{canManageRoster ? (
				<LinkButton
					size="small"
					to={manageTeamRosterPage(team.customUrl)}
					variant="outlined"
					prefetch="intent"
					preventScrollReset
					icon={<Users />}
					testId="manage-roster-button"
				>
					{t("team:actionButtons.manageRoster")}
				</LinkButton>
			) : null}
			{canEditTeam ? (
				<LinkButton
					size="small"
					to={editTeamPage(team.customUrl)}
					variant="outlined"
					prefetch="intent"
					preventScrollReset
					icon={<SquarePen />}
					testId="edit-team-button"
				>
					{t("team:actionButtons.editTeam")}
				</LinkButton>
			) : null}
			<TeamActionsMenu team={team} />
		</div>
	);
}

function TeamActionsMenu({ team }: { team: TeamLoaderData["team"] }) {
	const { t } = useTranslation(["common", "team"]);
	const user = useUser();
	const { submit } = useActionSubmit(teamProfilePageActionSchema);
	const [confirming, setConfirming] = React.useState<
		"LEAVE" | "DELETE" | "TRANSFER" | null
	>(null);

	const isMainTeam = team.members.some(
		(member) => user?.id === member.id && member.isMainTeam,
	);
	const showMainTeamIndicator = isTeamMember({ user, team }) && isMainTeam;
	const canMakeMainTeam = isTeamMember({ user, team }) && !isMainTeam;
	const canLeaveTeam = isTeamMember({ user, team }) && team.members.length > 1;
	const canTransferOwnership =
		isTeamOwner({ user, team }) && team.members.length > 1;
	const canDeleteTeam = useHasPermission(team, "DELETE");

	if (
		!showMainTeamIndicator &&
		!canMakeMainTeam &&
		!canLeaveTeam &&
		!canDeleteTeam
	) {
		return null;
	}

	const submitAction = (
		actionToSubmit: "LEAVE_TEAM" | "MAKE_MAIN_TEAM" | "DELETE_TEAM",
	) => {
		submit(actionToSubmit);
		setConfirming(null);
	};

	return (
		<>
			<SendouMenu
				trigger={
					<SendouButton
						size="big"
						variant="minimal"
						icon={<Menu />}
						aria-label={t("team:actionButtons.teamActions")}
						testId="team-actions-menu-button"
					/>
				}
			>
				{showMainTeamIndicator ? (
					<SendouMenuItem
						icon={<Star />}
						isActive
						isDisabled
						data-testid="main-team-indicator"
					>
						{t("team:actionButtons.mainTeam")}
					</SendouMenuItem>
				) : null}
				{canMakeMainTeam ? (
					<SendouMenuItem
						icon={<Star />}
						onAction={() => submitAction("MAKE_MAIN_TEAM")}
						data-testid="make-main-team-button"
					>
						{t("team:actionButtons.makeMainTeam")}
					</SendouMenuItem>
				) : null}
				{canLeaveTeam ? (
					<SendouMenuItem
						icon={<LogOut />}
						onAction={() => setConfirming("LEAVE")}
						data-testid="leave-team-button"
					>
						{t("team:actionButtons.leaveTeam")}
					</SendouMenuItem>
				) : null}
				{canTransferOwnership ? (
					<SendouMenuItem
						icon={<Crown />}
						onAction={() => setConfirming("TRANSFER")}
						data-testid="transfer-ownership-button"
					>
						{t("team:actionButtons.transferOwnership")}
					</SendouMenuItem>
				) : null}
				{canDeleteTeam ? (
					<SendouMenuItem
						icon={<Trash2 />}
						isDestructive
						onAction={() => setConfirming("DELETE")}
						data-testid="delete-team-button"
					>
						{t("team:actionButtons.deleteTeam")}
					</SendouMenuItem>
				) : null}
			</SendouMenu>
			<SendouDialog
				isOpen={confirming === "LEAVE"}
				onClose={() => setConfirming(null)}
				onOpenChange={() => setConfirming(null)}
				isDismissable
			>
				<ConfirmActionContent
					heading={t(
						isTeamOwner({ user, team })
							? "team:leaveTeam.header.newOwner"
							: "team:leaveTeam.header",
						{
							teamName: team.name,
							newOwner: resolveNewOwner(team.members)?.username,
						},
					)}
					buttonText={t("team:actionButtons.leaveTeam.confirm")}
					onConfirm={() => submitAction("LEAVE_TEAM")}
				/>
			</SendouDialog>
			<SendouDialog
				isOpen={confirming === "DELETE"}
				onClose={() => setConfirming(null)}
				onOpenChange={() => setConfirming(null)}
				isDismissable
			>
				<ConfirmActionContent
					heading={t("team:deleteTeam.header", { teamName: team.name })}
					buttonText={t("common:actions.delete")}
					onConfirm={() => submitAction("DELETE_TEAM")}
				/>
			</SendouDialog>
			{canTransferOwnership ? (
				<SendouDialog
					isOpen={confirming === "TRANSFER"}
					onClose={() => setConfirming(null)}
					onOpenChange={() => setConfirming(null)}
					isDismissable
				>
					<TransferOwnershipContent team={team} />
				</SendouDialog>
			) : null}
		</>
	);
}

function ConfirmActionContent({
	heading,
	buttonText,
	onConfirm,
}: {
	heading: string;
	buttonText: string;
	onConfirm: () => void;
}) {
	return (
		<div className="stack md">
			<h2 className="text-md text-center">{heading}</h2>
			<div className="stack horizontal md justify-center mt-2">
				<SendouButton
					variant="destructive"
					onClick={onConfirm}
					data-testid="confirm-button"
				>
					{buttonText}
				</SendouButton>
			</div>
		</div>
	);
}

function TransferOwnershipContent({ team }: { team: TeamLoaderData["team"] }) {
	const { t } = useTranslation(["team"]);
	const candidates = team.members.filter((member) => !member.isOwner);
	const defaultNewOwner = resolveNewOwner(team.members);
	invariant(defaultNewOwner, "Team has no member to transfer ownership to");
	const [newOwnerUserId, setNewOwnerUserId] = React.useState(
		defaultNewOwner.id,
	);

	return (
		<div className="stack md">
			<h2 className="text-md text-center">
				{t("team:transferOwnership.header", { teamName: team.name })}
			</h2>
			<p className="text-sm text-lighter">
				{t("team:transferOwnership.explanation")}
			</p>
			<SendouSelect
				label={t("team:transferOwnership.newOwner")}
				selectedKey={newOwnerUserId}
				onSelectionChange={(key) => {
					if (key !== null) setNewOwnerUserId(Number(key));
				}}
				items={candidates}
				data-testid="new-owner-select"
			>
				{(member) => (
					<SendouSelectItem
						key={member.id}
						id={member.id}
						textValue={member.username}
					>
						{member.username}
					</SendouSelectItem>
				)}
			</SendouSelect>
			<div className="stack horizontal md justify-center mt-2">
				<ActionButton
					schema={teamProfilePageActionSchema}
					action="TRANSFER_OWNERSHIP"
					fields={{ newOwnerUserId }}
					variant="destructive"
					testId="confirm-transfer-ownership-button"
				>
					{t("team:transferOwnership.confirm")}
				</ActionButton>
			</div>
		</div>
	);
}

function ResultsBanner({
	customUrl,
	results,
}: {
	customUrl: string;
	results: NonNullable<TeamLoaderData["results"]>;
}) {
	return (
		<Link
			className={styles.results}
			to={teamResultsPage(customUrl)}
			preventScrollReset
		>
			<div>View {results.count} results</div>
			<ul className={styles.resultsPlacements}>
				{results.placements.map(({ placement, count }) => {
					return (
						<li key={placement}>
							<Placement placement={placement} />×{count}
						</li>
					);
				})}
			</ul>
		</Link>
	);
}

function MemberRow({
	member,
	number,
}: {
	member: TeamRepository.findByCustomUrl["members"][number];
	number: number;
}) {
	const cardData = useUserCardData(member.id);

	return (
		<div
			className={styles.member}
			data-testid={member.isOwner ? `member-owner-${member.id}` : undefined}
		>
			<MemberRoleLine
				member={member}
				className={styles.memberRole}
				roleTestId={`member-row-role-${number}`}
			/>
			<div className={styles.memberSection}>
				<UserCard userId={member.id}>
					<span className={styles.memberAvatarNameContainer}>
						<NoteAvatar sentiment={cardData?.privateNote?.sentiment}>
							<div className={styles.memberAvatar}>
								<Avatar user={member} size="md" />
							</div>
						</NoteAvatar>
						{member.username}
					</span>
				</UserCard>
				<div className="stack horizontal md">
					{member.weapons.map((weapon) => (
						<WeaponImage
							key={weapon.weaponSplId}
							weapon={weapon}
							width={48}
							height={48}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

function MobileMemberCard({
	member,
}: {
	member: TeamRepository.findByCustomUrl["members"][number];
}) {
	const cardData = useUserCardData(member.id);

	return (
		<div className={styles.memberCardContainer}>
			<div className={styles.memberCard}>
				<UserCard userId={member.id}>
					<span className={styles.memberCardUser}>
						<NoteAvatar sentiment={cardData?.privateNote?.sentiment}>
							<Avatar user={member} size="md" />
						</NoteAvatar>
						<span className={styles.memberCardName}>{member.username}</span>
					</span>
				</UserCard>
				{member.weapons.length > 0 ? (
					<div className="stack horizontal md">
						{member.weapons.map((weapon) => (
							<WeaponImage
								key={weapon.weaponSplId}
								weapon={weapon}
								width={32}
								height={32}
							/>
						))}
					</div>
				) : null}
			</div>
			<MemberRoleLine member={member} className={styles.memberRoleMobile} />
		</div>
	);
}

function MemberRoleLine({
	member,
	className,
	roleTestId,
}: {
	member: TeamRepository.findByCustomUrl["members"][number];
	className: string;
	roleTestId?: string;
}) {
	const { t } = useTranslation(["team"]);

	const roleText =
		member.customRole || (member.role ? t(`team:roles.${member.role}`) : null);

	if (!member.isOwner && !roleText) return null;

	return (
		<span className={className}>
			{member.isOwner ? (
				<SendouPopover
					trigger={
						<SendouButton
							size="miniscule"
							variant="minimal"
							icon={<Crown className="text-theme" />}
							aria-label={t("team:owner")}
							testId="owner-crown-button"
						/>
					}
				>
					<span className="text-xs">{t("team:owner.explanation")}</span>
				</SendouPopover>
			) : null}
			{roleText ? <span data-testid={roleTestId}>{roleText}</span> : null}
		</span>
	);
}
