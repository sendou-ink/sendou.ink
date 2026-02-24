import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
	href,
	Link,
	useLoaderData,
	useMatches,
	useOutletContext,
} from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Flag } from "~/components/Flag";
import { Image, WeaponImage } from "~/components/Image";
import { BattlefyIcon } from "~/components/icons/Battlefy";
import { BskyIcon } from "~/components/icons/Bsky";
import { DiscordIcon } from "~/components/icons/Discord";
import { EditIcon } from "~/components/icons/Edit";
import { PuzzleIcon } from "~/components/icons/Puzzle";
import { TwitchIcon } from "~/components/icons/Twitch";
import { YouTubeIcon } from "~/components/icons/YouTube";
import { useUser } from "~/features/auth/core/user";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { modesShort } from "~/modules/in-game-lists/modes";
import { countryCodeToTranslatedName } from "~/utils/i18n";
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
import type { UserPageNavItem } from "../components/UserPageIconNav";
import { UserPageIconNav } from "../components/UserPageIconNav";
import { Widget } from "../components/Widget";
import { loader } from "../loaders/u.$identifier.index.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import styles from "./u.$identifier.module.css";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["badges", "team", "org", "vods", "lfg", "builds", "weapons", "gear"],
};

export default function UserInfoPage() {
	const data = useLoaderData<typeof loader>();

	if (data.type === "new") {
		return <NewUserInfoPage />;
	}
	return <OldUserInfoPage />;
}

function NewUserInfoPage() {
	const { t, i18n } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;
	const { navItems } = useOutletContext<{ navItems: UserPageNavItem[] }>();

	if (data.type !== "new") {
		throw new Error("Expected new user data");
	}

	const mainWidgets = data.widgets.filter((w) => w.slot === "main");
	const sideWidgets = data.widgets.filter((w) => w.slot === "side");

	const isOwnPage = layoutData.user.id === user?.id;

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<Avatar user={layoutData.user} size="xmd" />
				<div className={styles.userInfo}>
					<div className={styles.nameGroup}>
						<h1 className={styles.username}>{layoutData.user.username}</h1>
						<ProfileSubtitle
							inGameName={layoutData.user.inGameName}
							pronouns={layoutData.user.pronouns}
							plusTier={layoutData.user.plusTier}
							country={layoutData.user.country}
							language={i18n.language}
						/>
					</div>
				</div>
				<div className={styles.desktopIconNav}>
					<UserPageIconNav items={navItems} />
				</div>
			</div>
			{isOwnPage ? (
				<div className={styles.editButtons}>
					<LinkButton
						to={href("/u/:identifier/edit-widgets", {
							identifier:
								layoutData.user.customUrl ?? layoutData.user.discordId,
						})}
						variant="outlined"
						size="small"
						icon={<PuzzleIcon />}
					>
						{t("user:widgets.edit")}
					</LinkButton>
					<LinkButton
						to={href("/u/:identifier/edit", {
							identifier:
								layoutData.user.customUrl ?? layoutData.user.discordId,
						})}
						variant="outlined"
						size="small"
						icon={<EditIcon />}
					>
						{t("user:widgets.editProfile")}
					</LinkButton>
				</div>
			) : null}

			<div className={styles.mobileIconNav}>
				<UserPageIconNav items={navItems} />
			</div>

			<div className={styles.sideCarousel}>
				{sideWidgets.map((widget) => (
					<Widget key={widget.id} widget={widget} user={layoutData.user} />
				))}
			</div>

			<div className={styles.mainStack}>
				{mainWidgets.map((widget) => (
					<Widget key={widget.id} widget={widget} user={layoutData.user} />
				))}
			</div>

			<div className={styles.grid}>
				<div className={styles.main}>
					{mainWidgets.map((widget) => (
						<Widget key={widget.id} widget={widget} user={layoutData.user} />
					))}
				</div>
				<div className={styles.side}>
					{sideWidgets.map((widget) => (
						<Widget key={widget.id} widget={widget} user={layoutData.user} />
					))}
				</div>
			</div>
		</div>
	);
}

export function OldUserInfoPage() {
	const data = useLoaderData<typeof loader>();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;

	if (data.type !== "old") {
		throw new Error("Expected old user data");
	}

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

	if (data.type !== "old") {
		throw new Error("Expected old user data");
	}

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

	if (data.type !== "old") {
		throw new Error("Expected old user data");
	}

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

	if (data.type !== "old") {
		throw new Error("Expected old user data");
	}

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
			<div className="u__extra-info">#{data.user.id}</div>
			{data.user.discordUniqueName && (
				<div className="u__extra-info">
					<span className="u__extra-info__heading">
						<DiscordIcon />
					</span>{" "}
					{data.user.discordUniqueName}
				</div>
			)}
			{data.user.pronouns && (
				<div className="u__extra-info">
					<span className="u__extra-info__heading">
						{t("user:usesPronouns")}
					</span>{" "}
					{data.user.pronouns.subject}/{data.user.pronouns.object}
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

	if (data.type !== "old") {
		throw new Error("Expected old user data");
	}

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

function ProfileSubtitle({
	inGameName,
	pronouns,
	plusTier,
	country,
	language,
}: {
	inGameName: string | null;
	pronouns: { subject: string; object: string } | null;
	plusTier: number | null;
	country: string | null;
	language: string;
}) {
	const parts: React.ReactNode[] = [];

	if (inGameName) {
		parts.push(inGameName);
	}

	if (plusTier) {
		parts.push(`+${plusTier}`);
	}

	if (pronouns) {
		parts.push(`${pronouns.subject}/${pronouns.object}`);
	}

	if (country) {
		parts.push(
			<span key="country" className="stack horizontal xs items-center">
				<Flag countryCode={country} tiny />
				{countryCodeToTranslatedName({ countryCode: country, language })}
			</span>,
		);
	}

	if (parts.length === 0) return null;

	return (
		<div className={styles.subtitle}>
			{parts.map((part, i) => (
				<span key={i} className="stack horizontal xs items-center">
					{i > 0 ? <span>·</span> : null}
					{part}
				</span>
			))}
		</div>
	);
}

function TopPlacements() {
	const data = useLoaderData<typeof loader>();

	if (data.type !== "old") {
		throw new Error("Expected old user data");
	}

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
