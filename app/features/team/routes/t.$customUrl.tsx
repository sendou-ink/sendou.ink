import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { Flag } from "~/components/Flag";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { WeaponImage } from "~/components/Image";
import { BskyIcon } from "~/components/icons/Bsky";
import { EditIcon } from "~/components/icons/Edit";
import { StarIcon } from "~/components/icons/Star";
import { UsersIcon } from "~/components/icons/Users";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	bskyUrl,
	editTeamPage,
	manageTeamRosterPage,
	navIconUrl,
	TEAM_SEARCH_PAGE,
	teamPage,
	userPage,
	userSubmittedImage,
} from "~/utils/urls";
import type * as TeamRepository from "../TeamRepository.server";
import {
	isTeamManager,
	isTeamMember,
	isTeamOwner,
	resolveNewOwner,
} from "../team-utils";
import "../team.css";
import { useHasRole } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";

import { action } from "../actions/t.$customUrl.server";
import { loader } from "../loaders/t.$customUrl.server";
export { action, loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	return metaTags({
		title: args.data.team.name,
		description: args.data.team.bio ?? undefined,
		location: args.location,
		image: args.data.team.avatarSrc
			? {
					url: userSubmittedImage(args.data.team.avatarSrc),
					dimensions: {
						width: 124,
						height: 124,
					},
				}
			: undefined,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["team"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("t"),
				href: TEAM_SEARCH_PAGE,
				type: "IMAGE",
			},
			{
				text: data.team.name,
				href: teamPage(data.team.customUrl),
				type: "TEXT",
			},
		];
	},
};

export default function TeamPage() {
	const { team } = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<div className="stack sm">
				<TeamBanner />
				{/* <InfoBadges /> */}
			</div>
			<MobileTeamNameCountry />
			<ActionButtons />
			{/* {team.results ? <ResultsBanner results={team.results} /> : null} */}
			{team.bio ? <article data-testid="team-bio">{team.bio}</article> : null}
			<div className="stack lg">
				{team.members.map((member, i) => (
					<React.Fragment key={member.discordId}>
						<MemberRow member={member} number={i} />
						<MobileMemberCard member={member} />
					</React.Fragment>
				))}
			</div>
		</Main>
	);
}

function TeamBanner() {
	const { team } = useLoaderData<typeof loader>();

	return (
		<>
			<div
				className={clsx("team__banner", {
					team__banner__placeholder: !team.bannerSrc,
				})}
				style={{
					"--team-banner-img": team.bannerSrc
						? `url("${userSubmittedImage(team.bannerSrc)}")`
						: undefined,
				}}
			>
				{team.avatarSrc ? (
					<div className="team__banner__avatar">
						<div>
							<img src={userSubmittedImage(team.avatarSrc)} alt="" />
						</div>
					</div>
				) : null}
				<div className="team__banner__flags">
					{R.unique(
						team.members
							.map((member) => member.country)
							.filter((country) => country !== null),
					).map((country) => {
						return <Flag key={country} countryCode={country} />;
					})}
				</div>
				<div className="team__banner__name">
					{team.name} <BskyLink />
				</div>
			</div>
			{team.avatarSrc ? <div className="team__banner__avatar__spacer" /> : null}
		</>
	);
}

function MobileTeamNameCountry() {
	const { team } = useLoaderData<typeof loader>();

	return (
		<div className="team__mobile-name-country">
			<div className="stack horizontal sm">
				{R.unique(
					team.members
						.map((member) => member.country)
						.filter((country) => country !== null),
				).map((country) => {
					return <Flag key={country} countryCode={country} tiny />;
				})}
			</div>
			<div className="team__mobile-team-name">
				{team.name}
				<BskyLink />
			</div>
		</div>
	);
}

function BskyLink() {
	const { team } = useLoaderData<typeof loader>();

	if (!team.bsky) return null;

	return (
		<a
			className="team__bsky-link"
			data-testid="bsky-link"
			href={bskyUrl(team.bsky)}
			target="_blank"
			rel="noreferrer"
		>
			<BskyIcon />
		</a>
	);
}

function ActionButtons() {
	const { t } = useTranslation(["team"]);
	const user = useUser();
	const isAdmin = useHasRole("ADMIN");
	const { team } = useLoaderData<typeof loader>();

	if (!isTeamMember({ user, team }) && !isAdmin) {
		return null;
	}

	const isMainTeam = team.members.find(
		(member) => user?.id === member.id && member.isMainTeam,
	);

	return (
		<div className="team__action-buttons">
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

// function ResultsBanner({ results }: { results: TeamResultPeek }) {
// 	return (
// 		<Link className="team__results" to="results">
// 			<div>View {results.count} results</div>
// 			<ul className="team__results__placements">
// 				{results.placements.map(({ placement, count }) => {
// 					return (
// 						<li key={placement}>
// 							<Placement placement={placement} />×{count}
// 						</li>
// 					);
// 				})}
// 			</ul>
// 		</Link>
// 	);
// }

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
			className="team__member"
			data-testid={member.isOwner ? `member-owner-${member.id}` : undefined}
		>
			{member.role ? (
				<span
					className="team__member__role"
					data-testid={`member-row-role-${number}`}
				>
					{t(`team:roles.${member.role}`)}
				</span>
			) : null}
			<div className="team__member__section">
				<Link
					to={userPage(member)}
					className="team__member__avatar-name-container"
				>
					<div className="team__member__avatar">
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
		<div className="team__member-card__container">
			<div className="team__member-card">
				<Link to={userPage(member)} className="stack items-center">
					<Avatar user={member} size="md" />
					<div className="team__member-card__name">{member.username}</div>
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
				<span className="team__member__role__mobile">
					{t(`team:roles.${member.role}`)}
				</span>
			) : null}
		</div>
	);
}
