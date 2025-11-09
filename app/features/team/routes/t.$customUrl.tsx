import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as R from "remeda";
import { Flag } from "~/components/Flag";
import { BskyIcon } from "~/components/icons/Bsky";
import { Main } from "~/components/Main";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { bskyUrl, navIconUrl, TEAM_SEARCH_PAGE, teamPage } from "~/utils/urls";
import { loader } from "../loaders/t.$customUrl.server";
export { loader };

import "../team.css";

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	return metaTags({
		title: args.data.team.name,
		description: args.data.team.bio ?? undefined,
		location: args.location,
		image: args.data.team.avatarUrl
			? {
					url: args.data.team.avatarUrl,
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
	return (
		<Main className="stack sm">
			<div className="stack sm">
				<TeamBanner />
			</div>
			<MobileTeamNameCountry />
			<Outlet />
		</Main>
	);
}

function TeamBanner() {
	const { team } = useLoaderData<typeof loader>();

	return (
		<>
			<div
				className={clsx("team__banner", {
					team__banner__placeholder: !team.bannerUrl,
				})}
				style={{
					"--team-banner-img": team.bannerUrl
						? `url("${team.bannerUrl}")`
						: undefined,
				}}
			>
				{team.avatarUrl ? (
					<div className="team__banner__avatar">
						<div>
							<img src={team.avatarUrl} alt="" />
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
					{team.tag ? (
						<div className="team__banner__tag team__banner__tag__desktop">
							{team.tag}
						</div>
					) : null}
					{team.name} <BskyLink />
				</div>
			</div>
			{team.avatarUrl ? <div className="team__banner__avatar__spacer" /> : null}
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
			{team.tag ? (
				<div className="team__banner__tag team__banner__tag__mobile">
					{team.tag}
				</div>
			) : null}
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
