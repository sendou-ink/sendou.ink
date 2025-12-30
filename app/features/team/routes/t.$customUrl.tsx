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

import styles from "../team.module.css";

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
				className={clsx(
					styles.banner,
					!team.bannerUrl && styles.bannerPlaceholder,
				)}
				style={{
					"--team-banner-img": team.bannerUrl
						? `url("${team.bannerUrl}")`
						: undefined,
				}}
			>
				{team.avatarUrl ? (
					<div className={styles.bannerAvatar}>
						<div>
							<img src={team.avatarUrl} alt="" />
						</div>
					</div>
				) : null}
				<div className={styles.bannerFlags}>
					{R.unique(
						team.members
							.map((member) => member.country)
							.filter((country) => country !== null),
					).map((country) => {
						return <Flag key={country} countryCode={country} />;
					})}
				</div>
				<div className={styles.bannerName}>
					{team.tag ? (
						<div className={`${styles.bannerTag} ${styles.bannerTagDesktop}`}>
							{team.tag}
						</div>
					) : null}
					{team.name} <BskyLink />
				</div>
			</div>
			{team.avatarUrl ? <div className={styles.bannerAvatarSpacer} /> : null}
		</>
	);
}

function MobileTeamNameCountry() {
	const { team } = useLoaderData<typeof loader>();

	return (
		<div className={styles.mobileNameCountry}>
			<div className="stack horizontal sm">
				{R.unique(
					team.members
						.map((member) => member.country)
						.filter((country) => country !== null),
				).map((country) => {
					return <Flag key={country} countryCode={country} tiny />;
				})}
			</div>
			<div className={styles.mobileTeamName}>
				{team.name}
				<BskyLink />
			</div>
			{team.tag ? (
				<div className={`${styles.bannerTag} ${styles.bannerTagMobile}`}>
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
			className={styles.bskyLink}
			data-testid="bsky-link"
			href={bskyUrl(team.bsky)}
			target="_blank"
			rel="noreferrer"
		>
			<BskyIcon />
		</a>
	);
}
