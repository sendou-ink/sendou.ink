import { Link, useLoaderData, useMatches } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Flag } from "~/components/Flag";
import { Image, WeaponImage } from "~/components/Image";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { BattlefyIcon } from "~/components/icons/Battlefy";
import { BskyIcon } from "~/components/icons/Bsky";
import { DiscordIcon } from "~/components/icons/Discord";
import { TwitchIcon } from "~/components/icons/Twitch";
import { YouTubeIcon } from "~/components/icons/YouTube";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { modesShort } from "~/modules/in-game-lists";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { rawSensToString } from "~/utils/strings";
import { assertUnreachable } from "~/utils/types";
import {
	bskyUrl,
	modeImageUrl,
	navIconUrl,
	teamPage,
	topSearchPlayerPage,
	userSubmittedImage,
} from "~/utils/urls";
import type { UserPageLoaderData } from "./u.$identifier";

import { loader } from "../loaders/u.$identifier.index.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["badges", "team"],
};

export default function UserInfoPage() {
	const data = useLoaderData<typeof loader>();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;

	return (
		<div className="u__container">
			<div className="u__avatar-container">
				<Avatar user={layoutData.user} size="lg" className="u__avatar" />
				<div>
					<h2 className="u__name">
						<div>{layoutData.user.username}</div>
						<div>
							{data.user.country ? (
								<Flag countryCode={data.user.country} tiny />
							) : null}
						</div>
					</h2>
					<TeamInfo />
				</div>
				<div className="u__socials">
					{data.user.twitch ? (
						<SocialLink type="twitch" identifier={data.user.twitch} />
					) : null}
					{data.user.youtubeId ? (
						<SocialLink type="youtube" identifier={data.user.youtubeId} />
					) : null}
					{data.user.battlefy ? (
						<SocialLink type="battlefy" identifier={data.user.battlefy} />
					) : null}
					{data.user.bsky ? (
						<SocialLink type="bsky" identifier={data.user.bsky} />
					) : null}
				</div>
			</div>
			<BannedInfo />
			<ExtraInfos />
			<WeaponPool />
			<TopPlacements />
			<BadgeDisplay badges={data.user.badges} key={layoutData.user.id} />
			{data.user.bio && <article>{data.user.bio}</article>}
		</div>
	);
}

function TeamInfo() {
	const { t } = useTranslation(["team"]);
	const data = useLoaderData<typeof loader>();

	if (!data.user.team) return null;

	return (
		<div className="stack horizontal sm">
			<Link
				to={teamPage(data.user.team.customUrl)}
				className="u__team"
				data-testid="main-team-link"
			>
				{data.user.team.avatarUrl ? (
					<img
						alt=""
						src={userSubmittedImage(data.user.team.avatarUrl)}
						width={32}
						height={32}
						className="rounded-full"
					/>
				) : null}
				<div>
					{data.user.team.name}
					{data.user.team.userTeamRole ? (
						<div className="text-xxs text-lighter font-bold">
							{t(`team:roles.${data.user.team.userTeamRole}`)}
						</div>
					) : null}
				</div>
			</Link>
			<SecondaryTeamsPopover />
		</div>
	);
}

function SecondaryTeamsPopover() {
	const { t } = useTranslation(["team"]);

	const data = useLoaderData<typeof loader>();

	if (data.user.secondaryTeams.length === 0) return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					className="focus-text-decoration self-start"
					variant="minimal"
					size="small"
				>
					<span
						className="text-sm font-bold text-main-forced"
						data-testid="secondary-team-trigger"
					>
						+{data.user.secondaryTeams.length}
					</span>
				</SendouButton>
			}
		>
			<div className="stack sm">
				{data.user.secondaryTeams.map((team) => (
					<div
						key={team.customUrl}
						className="stack horizontal md items-center"
					>
						<Link
							to={teamPage(team.customUrl)}
							className="u__team text-main-forced"
						>
							{team.avatarUrl ? (
								<img
									alt=""
									src={userSubmittedImage(team.avatarUrl)}
									width={24}
									height={24}
									className="rounded-full"
								/>
							) : null}
							{team.name}
						</Link>
						{team.userTeamRole ? (
							<div className="text-xxs text-lighter font-bold">
								{t(`team:roles.${team.userTeamRole}`)}
							</div>
						) : null}
					</div>
				))}
			</div>
		</SendouPopover>
	);
}

interface SocialLinkProps {
	type: "youtube" | "twitch" | "battlefy" | "bsky";
	identifier: string;
}

export function SocialLink({
	type,
	identifier,
}: {
	type: SocialLinkProps["type"];
	identifier: string;
}) {
	const href = () => {
		switch (type) {
			case "twitch":
				return `https://www.twitch.tv/${identifier}`;
			case "youtube":
				return `https://www.youtube.com/channel/${identifier}`;
			case "battlefy":
				return `https://battlefy.com/users/${identifier}`;
			case "bsky":
				return bskyUrl(identifier);
			default:
				assertUnreachable(type);
		}
	};

	return (
		<a
			className={clsx("u__social-link", {
				youtube: type === "youtube",
				twitch: type === "twitch",
				battlefy: type === "battlefy",
				bsky: type === "bsky",
			})}
			href={href()}
		>
			<SocialLinkIcon type={type} />
		</a>
	);
}

function SocialLinkIcon({ type }: Pick<SocialLinkProps, "type">) {
	switch (type) {
		case "twitch":
			return <TwitchIcon />;
		case "youtube":
			return <YouTubeIcon />;
		case "battlefy":
			return <BattlefyIcon />;
		case "bsky":
			return <BskyIcon />;
		default:
			assertUnreachable(type);
	}
}

function ExtraInfos() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	const motionSensText =
		typeof data.user.motionSens === "number"
			? `${t("user:motion")} ${rawSensToString(data.user.motionSens)}`
			: null;

	const stickSensText =
		typeof data.user.stickSens === "number"
			? `${t("user:stick")} ${rawSensToString(data.user.stickSens)}`
			: null;

	if (
		!data.user.inGameName &&
		typeof data.user.stickSens !== "number" &&
		!data.user.discordUniqueName &&
		!data.user.plusTier
	) {
		return null;
	}

	return (
		<div className="u__extra-infos">
			{data.user.discordUniqueName && (
				<div className="u__extra-info">
					<span className="u__extra-info__heading">
						<DiscordIcon />
					</span>{" "}
					{data.user.discordUniqueName}
				</div>
			)}
			{data.user.inGameName && (
				<div className="u__extra-info">
					<span className="u__extra-info__heading">{t("user:ign.short")}</span>{" "}
					{data.user.inGameName}
				</div>
			)}
			{typeof data.user.stickSens === "number" && (
				<div className="u__extra-info">
					<span className="u__extra-info__heading">{t("user:sens")}</span>{" "}
					{[motionSensText, stickSensText].filter(Boolean).join(" / ")}
				</div>
			)}
			{data.user.plusTier && (
				<div className="u__extra-info">
					<Image path={navIconUrl("plus")} width={20} height={20} alt="" />{" "}
					{data.user.plusTier}
				</div>
			)}
		</div>
	);
}

function WeaponPool() {
	const data = useLoaderData<typeof loader>();

	if (data.user.weapons.length === 0) return null;

	return (
		<div className="stack horizontal sm justify-center">
			{data.user.weapons.map((weapon, i) => {
				return (
					<div key={weapon.weaponSplId} className="u__weapon">
						<WeaponImage
							testId={`${weapon.weaponSplId}-${i + 1}`}
							weaponSplId={weapon.weaponSplId}
							variant={weapon.isFavorite ? "badge-5-star" : "badge"}
							width={38}
							height={38}
						/>
					</div>
				);
			})}
		</div>
	);
}

function TopPlacements() {
	const data = useLoaderData<typeof loader>();

	if (data.user.topPlacements.length === 0) return null;

	return (
		<Link
			to={topSearchPlayerPage(data.user.topPlacements[0].playerId)}
			className="u__placements"
			data-testid="placements-box"
		>
			{modesShort.map((mode) => {
				const placement = data.user.topPlacements.find(
					(placement) => placement.mode === mode,
				);

				if (!placement) return null;

				return (
					<div key={mode} className="u__placements__mode">
						<Image path={modeImageUrl(mode)} alt="" width={24} height={24} />
						<div>
							{placement.rank} / {placement.power}
						</div>
					</div>
				);
			})}
		</Link>
	);
}

function BannedInfo() {
	const data = useLoaderData<typeof loader>();

	const { banned, bannedReason } = data.banned ?? {};

	if (!banned) return null;

	const ends = (() => {
		if (!banned || banned === 1) return null;

		return databaseTimestampToDate(banned);
	})();

	return (
		<div className="mb-4">
			<h2 className="text-warning">Account suspended</h2>
			{bannedReason ? <div>Reason: {bannedReason}</div> : null}
			{ends ? (
				<div suppressHydrationWarning>
					Ends:{" "}
					{ends.toLocaleString("en-US", {
						month: "long",
						day: "numeric",
						year: "numeric",
						hour: "numeric",
						minute: "numeric",
					})}
				</div>
			) : (
				<div>
					Ends: <i>no end time set</i>
				</div>
			)}
		</div>
	);
}
