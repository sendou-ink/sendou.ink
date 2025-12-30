import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useMatches } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Flag } from "~/components/Flag";
import { Image, WeaponImage } from "~/components/Image";
import { BattlefyIcon } from "~/components/icons/Battlefy";
import { BskyIcon } from "~/components/icons/Bsky";
import { DiscordIcon } from "~/components/icons/Discord";
import { TwitchIcon } from "~/components/icons/Twitch";
import { YouTubeIcon } from "~/components/icons/YouTube";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { modesShort } from "~/modules/in-game-lists/modes";
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
} from "~/utils/urls";
import { loader } from "../loaders/u.$identifier.index.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import styles from "../user-page.module.css";
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
		<div className={styles.container}>
			<div className={styles.avatarContainer}>
				<Avatar user={layoutData.user} size="lg" className={styles.avatar} />
				<div>
					<h2 className={styles.name}>
						<div>{layoutData.user.username}</div>
						<div>
							{data.user.country ? (
								<Flag countryCode={data.user.country} tiny />
							) : null}
						</div>
					</h2>
					<TeamInfo />
				</div>
				<div className={styles.socials}>
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
				className={styles.team}
				data-testid="main-team-link"
			>
				{data.user.team.avatarUrl ? (
					<img
						alt=""
						src={data.user.team.avatarUrl}
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
							className={clsx(styles.team, "text-main-forced")}
						>
							{team.avatarUrl ? (
								<img
									alt=""
									src={team.avatarUrl}
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
			className={clsx(styles.socialLink, {
				[styles.socialLinkYoutube]: type === "youtube",
				[styles.socialLinkTwitch]: type === "twitch",
				[styles.socialLinkBattlefy]: type === "battlefy",
				[styles.socialLinkBsky]: type === "bsky",
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
		<div className={styles.extraInfos}>
			<div className={styles.extraInfo}>#{data.user.id}</div>
			{data.user.discordUniqueName && (
				<div className={styles.extraInfo}>
					<span className={styles.extraInfoHeading}>
						<DiscordIcon />
					</span>{" "}
					{data.user.discordUniqueName}
				</div>
			)}
			{data.user.inGameName && (
				<div className={styles.extraInfo}>
					<span className={styles.extraInfoHeading}>{t("user:ign.short")}</span>{" "}
					{data.user.inGameName}
				</div>
			)}
			{typeof data.user.stickSens === "number" && (
				<div className={styles.extraInfo}>
					<span className={styles.extraInfoHeading}>{t("user:sens")}</span>{" "}
					{[motionSensText, stickSensText].filter(Boolean).join(" / ")}
				</div>
			)}
			{data.user.plusTier && (
				<div className={styles.extraInfo}>
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
					<div key={weapon.weaponSplId} className={styles.weapon}>
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
			className={styles.placements}
			data-testid="placements-box"
		>
			{modesShort.map((mode) => {
				const placement = data.user.topPlacements.find(
					(placement) => placement.mode === mode,
				);

				if (!placement) return null;

				return (
					<div key={mode} className={styles.placementsMode}>
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
