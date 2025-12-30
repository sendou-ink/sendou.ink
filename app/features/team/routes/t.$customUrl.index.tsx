import { Link, useFetcher, useMatches } from "@remix-run/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { WeaponImage } from "~/components/Image";
import { EditIcon } from "~/components/icons/Edit";
import { StarIcon } from "~/components/icons/Star";
import { UsersIcon } from "~/components/icons/Users";
import { Placement } from "~/components/Placement";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import type { TeamLoaderData } from "~/features/team/loaders/t.$customUrl.server";
import { useHasRole } from "~/modules/permissions/hooks";
import invariant from "~/utils/invariant";
import { editTeamPage, manageTeamRosterPage, userPage } from "~/utils/urls";
import { action } from "../actions/t.$customUrl.index.server";
import type * as TeamRepository from "../TeamRepository.server";
import styles from "../team.module.css";
import {
	isTeamManager,
	isTeamMember,
	isTeamOwner,
	resolveNewOwner,
} from "../team-utils";
export { action };

export default function TeamIndexPage() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as TeamLoaderData;

	return (
		<div className="stack lg">
			<ActionButtons />
			{layoutData.results ? (
				<ResultsBanner results={layoutData.results} />
			) : null}
			{layoutData.team.bio ? (
				<article data-testid="team-bio">{layoutData.team.bio}</article>
			) : null}
			<div className="stack lg">
				{layoutData.team.members.map((member, i) => (
					<React.Fragment key={member.discordId}>
						<MemberRow member={member} number={i} />
						<MobileMemberCard member={member} />
					</React.Fragment>
				))}
			</div>
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

	const isMainTeam = team.members.find(
		(member) => user?.id === member.id && member.isMainTeam,
	);

	return (
		<div className={styles.actionButtons}>
			{isTeamMember({ user, team }) && !isMainTeam ? (
				<ChangeMainTeamButton />
			) : null}
			{isTeamMember({ user, team }) ? (
				<FormWithConfirm
					dialogHeading={`${t(
						isTeamOwner({ user, team })
							? "team:leaveTeam.header.newOwner"
							: "team:leaveTeam.header",
						{
							teamName: team.name,
							newOwner: resolveNewOwner(team.members)?.username,
						},
					)}`}
					submitButtonText={t("team:actionButtons.leaveTeam.confirm")}
					fields={[["_action", "LEAVE_TEAM"]]}
				>
					<SendouButton
						size="small"
						variant="destructive"
						data-testid="leave-team-button"
					>
						{t("team:actionButtons.leaveTeam")}
					</SendouButton>
				</FormWithConfirm>
			) : null}
			{isTeamManager({ user, team }) || isAdmin ? (
				<LinkButton
					size="small"
					to={manageTeamRosterPage(team.customUrl)}
					variant="outlined"
					prefetch="intent"
					icon={<UsersIcon />}
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
					icon={<EditIcon />}
					testId="edit-team-button"
				>
					{t("team:actionButtons.editTeam")}
				</LinkButton>
			) : null}
		</div>
	);
}

function ChangeMainTeamButton() {
	const { t } = useTranslation(["team"]);
	const fetcher = useFetcher();

	return (
		<fetcher.Form method="post">
			<SubmitButton
				_action="MAKE_MAIN_TEAM"
				size="small"
				variant="outlined"
				icon={<StarIcon />}
				testId="make-main-team-button"
			>
				{t("team:actionButtons.makeMainTeam")}
			</SubmitButton>
		</fetcher.Form>
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
			{member.role ? (
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
					{member.weapons.map(({ weaponSplId, isFavorite }) => (
						<WeaponImage
							key={weaponSplId}
							variant={isFavorite ? "badge-5-star" : "badge"}
							weaponSplId={weaponSplId}
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
						{member.weapons.map(({ weaponSplId, isFavorite }) => (
							<WeaponImage
								key={weaponSplId}
								variant={isFavorite ? "badge-5-star" : "badge"}
								weaponSplId={weaponSplId}
								width={32}
								height={32}
							/>
						))}
					</div>
				) : null}
			</div>
			{member.role ? (
				<span className={styles.memberRoleMobile}>
					{t(`team:roles.${member.role}`)}
				</span>
			) : null}
		</div>
	);
}
