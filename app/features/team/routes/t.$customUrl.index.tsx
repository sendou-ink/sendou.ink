import {
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
import { Link, useFetcher, useMatches } from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { WeaponImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import { useUser } from "~/features/auth/core/user";
import type { TeamLoaderData } from "~/features/team/loaders/t.$customUrl.server";
import { useHasRole } from "~/modules/permissions/hooks";
import invariant from "~/utils/invariant";
import { editTeamPage, manageTeamRosterPage, userPage } from "~/utils/urls";
import { action } from "../actions/t.$customUrl.index.server";
import type * as TeamRepository from "../TeamRepository.server";
import styles from "../team.module.css";
import {
	getMemberRoleType,
	isTeamManager,
	isTeamMember,
	isTeamOwner,
	resolveNewOwner,
} from "../team-utils";

export { action };

export default function TeamIndexPage() {
	const { t } = useTranslation(["team"]);
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as TeamLoaderData;

	const members = layoutData.team.members;
	const playerMembers = members.filter(
		(member) => getMemberRoleType(member) !== "OTHER",
	);
	const otherMembers = members.filter(
		(member) => getMemberRoleType(member) === "OTHER",
	);
	const showSections = playerMembers.length > 0 && otherMembers.length > 0;

	const renderMember = (member: (typeof members)[number]) => (
		<React.Fragment key={member.discordId}>
			<MemberRow member={member} number={members.indexOf(member)} />
			<MobileMemberCard member={member} />
		</React.Fragment>
	);

	return (
		<div className="stack lg">
			<ActionButtons />
			{layoutData.results ? (
				<ResultsBanner results={layoutData.results} />
			) : null}
			{layoutData.team.bio ? (
				<article data-testid="team-bio">{layoutData.team.bio}</article>
			) : null}
			{showSections ? (
				<SendouTabs>
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
	const isAdmin = useHasRole("ADMIN");
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as TeamLoaderData;
	const team = layoutData.team;

	if (!isTeamMember({ user, team }) && !isAdmin) {
		return null;
	}

	return (
		<div className={styles.actionButtons}>
			{isTeamManager({ user, team }) || isAdmin ? (
				<LinkButton
					size="small"
					to={manageTeamRosterPage(team.customUrl)}
					variant="outlined"
					prefetch="intent"
					icon={<Users />}
					testId="manage-roster-button"
				>
					{t("team:actionButtons.manageRoster")}
				</LinkButton>
			) : null}
			{isTeamManager({ user, team }) || isAdmin ? (
				<LinkButton
					size="small"
					to={editTeamPage(team.customUrl)}
					variant="outlined"
					prefetch="intent"
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
	const isAdmin = useHasRole("ADMIN");
	const fetcher = useFetcher();
	const [confirming, setConfirming] = React.useState<"LEAVE" | "DELETE" | null>(
		null,
	);

	const isMainTeam = team.members.some(
		(member) => user?.id === member.id && member.isMainTeam,
	);
	const showMainTeamIndicator = isTeamMember({ user, team }) && isMainTeam;
	const canMakeMainTeam = isTeamMember({ user, team }) && !isMainTeam;
	const canLeaveTeam = isTeamMember({ user, team }) && team.members.length > 1;
	const canDeleteTeam = isTeamOwner({ user, team }) || isAdmin;

	if (
		!showMainTeamIndicator &&
		!canMakeMainTeam &&
		!canLeaveTeam &&
		!canDeleteTeam
	) {
		return null;
	}

	const submitAction = (action: string) => {
		fetcher.submit({ _action: action }, { method: "post" });
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
					onPress={onConfirm}
					data-testid="confirm-button"
				>
					{buttonText}
				</SendouButton>
			</div>
		</div>
	);
}

function ResultsBanner({
	results,
}: {
	results: NonNullable<TeamLoaderData["results"]>;
}) {
	return (
		<Link className={styles.results} to="results">
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
	const { t } = useTranslation(["team"]);

	return (
		<div
			className={styles.member}
			data-testid={member.isOwner ? `member-owner-${member.id}` : undefined}
		>
			{member.customRole ? (
				<span
					className={styles.memberRole}
					data-testid={`member-row-role-${number}`}
				>
					{member.customRole}
				</span>
			) : member.role ? (
				<span
					className={styles.memberRole}
					data-testid={`member-row-role-${number}`}
				>
					{t(`team:roles.${member.role}`)}
				</span>
			) : null}
			<div className={styles.memberSection}>
				<Link
					to={userPage(member)}
					className={styles.memberAvatarNameContainer}
				>
					<div className={styles.memberAvatar}>
						<Avatar user={member} size="md" />
					</div>
					{member.username}
				</Link>
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
	const { t } = useTranslation(["team"]);

	return (
		<div className={styles.memberCardContainer}>
			<div className={styles.memberCard}>
				<Link to={userPage(member)} className="stack items-center">
					<Avatar user={member} size="md" />
					<div className={styles.memberCardName}>{member.username}</div>
				</Link>
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
			{member.customRole ? (
				<span className={styles.memberRoleMobile}>{member.customRole}</span>
			) : member.role ? (
				<span className={styles.memberRoleMobile}>
					{t(`team:roles.${member.role}`)}
				</span>
			) : null}
		</div>
	);
}
