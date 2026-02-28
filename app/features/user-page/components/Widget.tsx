import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BuildCard } from "~/components/BuildCard";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Image, StageImage, WeaponImage } from "~/components/Image";
import { BskyIcon } from "~/components/icons/Bsky";
import { DiscordIcon } from "~/components/icons/Discord";
import { LinkIcon } from "~/components/icons/Link";
import { TwitchIcon } from "~/components/icons/Twitch";
import { YouTubeIcon } from "~/components/icons/YouTube";
import { Markdown } from "~/components/Markdown";
import { Placement } from "~/components/Placement";
import type { Tables } from "~/db/tables";
import { previewUrl } from "~/features/art/art-utils";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { VodListing } from "~/features/vods/components/VodListing";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import type { GameBadgeId } from "~/modules/in-game-lists/game-badge-ids";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { assertUnreachable } from "~/utils/types";
import {
	brandImageUrl,
	calendarEventPage,
	controllerImageUrl,
	gameBadgeUrl,
	LEADERBOARDS_PAGE,
	LFG_PAGE,
	modeImageUrl,
	navIconUrl,
	teamPage,
	topSearchPlayerPage,
	tournamentBracketsPage,
	tournamentOrganizationPage,
	userArtPage,
	userBuildsPage,
	userResultsPage,
	userVodsPage,
} from "~/utils/urls";
import type { LoadedWidget } from "../core/widgets/types";
import styles from "./Widget.module.css";

export function Widget({
	widget,
	user,
}: {
	widget: SerializeFrom<LoadedWidget>;
	user: Pick<Tables["User"], "discordId" | "customUrl">;
}) {
	const { t } = useTranslation(["user", "badges", "team", "org", "lfg"]);
	const { formatDate } = useTimeFormat();

	const content = () => {
		switch (widget.id) {
			case "bio":
				return <article>{widget.data.bio}</article>;
			case "bio-md":
				return (
					<article>
						<Markdown>{widget.data.bio}</Markdown>
					</article>
				);
			case "badges-owned":
				return <BadgeDisplay badges={widget.data} />;
			case "badges-authored":
				return <BadgeDisplay badges={widget.data} />;
			case "badges-managed":
				return <BadgeDisplay badges={widget.data} />;
			case "teams":
				return (
					<Memberships
						memberships={widget.data.map((team) => ({
							id: team.id,
							url: teamPage(team.customUrl),
							name: team.name,
							logoUrl: team.logoUrl,
							roleDisplayName: team.role ? t(`team:roles.${team.role}`) : null,
						}))}
					/>
				);
			case "organizations":
				return (
					<Memberships
						memberships={widget.data.map((org) => ({
							id: org.id,
							url: tournamentOrganizationPage({
								organizationSlug: org.slug,
							}),
							name: org.name,
							logoUrl: org.logoUrl,
							roleDisplayName:
								org.roleDisplayName ?? t(`org:roles.${org.role}`),
						}))}
					/>
				);
			case "peak-sp":
				if (!widget.data) return null;
				return (
					<BigValue
						value={widget.data.peakSp}
						unit="SP"
						footer={`${widget.data.tierName}${widget.data.isPlus ? "+" : ""} / ${t("user:seasons.season.short")}${widget.data.season}`}
					/>
				);
			case "top-10-seasons":
			case "top-100-seasons":
				if (!widget.data) return null;
				return (
					<BigValue
						value={widget.data.times}
						footer={widget.data.seasons
							.sort((a, b) => a - b)
							.map((s) => `S${s}`)
							.join(" ")}
					/>
				);
			case "peak-xp":
				if (!widget.data) return null;
				return (
					<BigValue
						value={widget.data.peakXp}
						unit="XP"
						footer={`${widget.data.division}${widget.data.topRating ? ` / #${widget.data.topRating}` : ""}`}
					/>
				);
			case "peak-xp-unverified":
				return (
					<BigValue
						value={widget.data.peakXp}
						unit="XP"
						footer={
							widget.data.division === "tentatek" ? "Tentatek" : "Takoroka"
						}
					/>
				);
			case "peak-xp-weapon":
				if (!widget.data) return null;
				return (
					<PeakXpWeapon
						weaponSplId={widget.data.weaponSplId as MainWeaponId}
						peakXp={widget.data.peakXp}
						leaderboardPosition={widget.data.leaderboardPosition}
					/>
				);
			case "highlighted-results":
				return widget.data.length === 0 ? null : (
					<HighlightedResults results={widget.data} />
				);
			case "placement-results":
				if (!widget.data) return null;
				return <PlacementResults data={widget.data} />;
			case "patron-since":
				if (!widget.data) return null;
				return (
					<BigValue
						value={formatDate(databaseTimestampToDate(widget.data), {
							day: "numeric",
							month: "short",
							year: "numeric",
						})}
					/>
				);
			case "timezone":
				return <TimezoneWidget timezone={widget.data.timezone} />;
			case "favorite-stage":
				return <FavoriteStageWidget stageId={widget.data.stageId as StageId} />;
			case "videos":
				return widget.data.length === 0 ? null : (
					<Videos videos={widget.data} />
				);
			case "lfg-posts":
				return widget.data.length === 0 ? null : (
					<LFGPosts posts={widget.data} />
				);
			case "top-500-weapons":
				if (!widget.data) return null;
				return <Top500Weapons weaponIds={widget.data} />;
			case "top-500-weapons-shooters":
			case "top-500-weapons-blasters":
			case "top-500-weapons-rollers":
			case "top-500-weapons-brushes":
			case "top-500-weapons-chargers":
			case "top-500-weapons-sloshers":
			case "top-500-weapons-splatlings":
			case "top-500-weapons-dualies":
			case "top-500-weapons-brellas":
			case "top-500-weapons-stringers":
			case "top-500-weapons-splatanas": {
				if (!widget.data) return null;

				return (
					<Top500Weapons
						weaponIds={widget.data.weaponIds}
						count={widget.data.weaponIds.length}
						total={widget.data.total}
					/>
				);
			}
			case "x-rank-peaks":
				return widget.data.length === 0 ? null : (
					<XRankPeaks peaks={widget.data} />
				);
			case "builds":
				return widget.data.length === 0 ? null : (
					<Builds builds={widget.data} />
				);
			case "weapon-pool":
				return widget.data.weapons.length === 0 ? null : (
					<WeaponPool
						weapons={
							widget.data.weapons as Array<{
								id: MainWeaponId;
								isFavorite: boolean;
							}>
						}
					/>
				);
			case "sens":
				return <SensWidget data={widget.data} />;
			case "art":
				return widget.data.length === 0 ? null : (
					<ArtWidget arts={widget.data} />
				);
			case "commissions":
				return <CommissionsWidget data={widget.data} />;
			case "social-links":
				return <SocialLinksWidget data={widget.data} />;
			case "links":
				return widget.data.length === 0 ? null : (
					<LinksWidget links={widget.data} />
				);
			case "tier-list":
				return <TierListWidget searchParams={widget.data.searchParams} />;
			case "game-badges":
			case "game-badges-small":
				return widget.data.length === 0 ? null : (
					<GameBadgesDisplay badgeIds={widget.data} />
				);
			default:
				assertUnreachable(widget);
		}
	};

	const widgetLink = (() => {
		switch (widget.id) {
			case "videos":
				return userVodsPage(user);
			case "x-rank-peaks":
				return widget.data.length > 0
					? topSearchPlayerPage(widget.data[0].playerId)
					: null;
			case "highlighted-results":
				return userResultsPage(user);
			case "placement-results":
				return userResultsPage(user);
			case "builds":
				return userBuildsPage(user);
			case "peak-xp-weapon":
				return widget.data
					? `${LEADERBOARDS_PAGE}?type=XP-WEAPON-${widget.data.weaponSplId}`
					: null;
			case "art":
				return widget.data.length > 0 ? userArtPage(user) : null;
			default:
				return null;
		}
	})();

	return (
		<div className={styles.widget}>
			<div className={styles.header}>
				<h2 className={styles.headerText}>{t(`user:widget.${widget.id}`)}</h2>
				{widgetLink ? (
					<Link to={widgetLink} className={styles.headerLink}>
						{t("user:widget.link.all")}
					</Link>
				) : null}
			</div>
			<div className={styles.content}>{content()}</div>
		</div>
	);
}

function BigValue({
	value,
	unit,
	footer,
}: {
	value: number | string;
	unit?: string;
	footer?: string;
}) {
	return (
		<div className={styles.peakValue}>
			<div className={styles.widgetValueMain}>
				{value} {unit ? unit : null}
			</div>
			{footer ? <div className={styles.widgetValueFooter}>{footer}</div> : null}
		</div>
	);
}

function Memberships({
	memberships,
}: {
	memberships: Array<{
		id: number;
		url: string;
		name: string;
		logoUrl: string | null;
		roleDisplayName: string | null;
	}>;
}) {
	return (
		<div className={styles.memberships}>
			{memberships.map((membership) => (
				<Link
					key={membership.id}
					to={membership.url}
					className={styles.membership}
				>
					{membership.logoUrl ? (
						<img
							alt=""
							src={membership.logoUrl}
							width={42}
							height={42}
							className="rounded-full"
						/>
					) : null}
					<div className={styles.membershipInfo}>
						<div className={styles.membershipName}>{membership.name}</div>
						{membership.roleDisplayName ? (
							<div className={styles.membershipRole}>
								{membership.roleDisplayName}
							</div>
						) : null}
					</div>
				</Link>
			))}
		</div>
	);
}

function HighlightedResults({
	results,
}: {
	results: Extract<LoadedWidget, { id: "highlighted-results" }>["data"];
}) {
	const { formatDate } = useTimeFormat();

	return (
		<div className={styles.highlightedResults}>
			{results.map((result, i) => (
				<div key={i} className={styles.result}>
					<div className={styles.resultPlacement}>
						<Placement placement={result.placement} size={28} />
					</div>
					<div className={styles.resultInfo}>
						<div className={styles.resultName}>
							{result.eventId ? (
								<Link
									to={calendarEventPage(result.eventId)}
									className="text-main-forced"
								>
									{result.eventName}
								</Link>
							) : null}
							{result.tournamentId ? (
								<div className={styles.tournamentName}>
									{result.logoUrl ? (
										<img
											src={result.logoUrl}
											alt=""
											width={18}
											height={18}
											className="rounded-full"
										/>
									) : null}
									<Link
										to={tournamentBracketsPage({
											tournamentId: result.tournamentId,
										})}
										className="text-main-forced"
									>
										{result.eventName}
									</Link>
								</div>
							) : null}
						</div>
						<div className={styles.resultDate}>
							{formatDate(databaseTimestampToDate(result.startTime), {
								day: "numeric",
								month: "short",
								year: "numeric",
							})}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

function Videos({
	videos,
}: {
	videos: Extract<LoadedWidget, { id: "videos" }>["data"];
}) {
	return (
		<div className={styles.videos}>
			{videos.map((video) => (
				<VodListing key={video.id} vod={video} showUser={false} />
			))}
		</div>
	);
}

function Top500Weapons({
	weaponIds,
	count,
	total,
}: {
	weaponIds: MainWeaponId[];
	count?: number;
	total?: number;
}) {
	const isComplete =
		typeof count === "number" && typeof total === "number" && count === total;

	return (
		<div>
			<div className={styles.weaponGrid}>
				{weaponIds.map((weaponId) => (
					<WeaponImage key={weaponId} weaponSplId={weaponId} variant="badge" />
				))}
			</div>
			{typeof count === "number" && typeof total === "number" ? (
				<div
					className={clsx(styles.weaponCount, {
						[styles.weaponCountComplete]: isComplete,
					})}
				>
					{count} / {total}
				</div>
			) : null}
		</div>
	);
}

function LFGPosts({
	posts,
}: {
	posts: Extract<LoadedWidget, { id: "lfg-posts" }>["data"];
}) {
	const { t } = useTranslation(["lfg"]);

	return (
		<div className={styles.lfgPosts}>
			{posts.map((post) => (
				<Link
					key={post.id}
					to={`${LFG_PAGE}#${post.id}`}
					className={styles.lfgPost}
				>
					{t(`lfg:types.${post.type}`)}
				</Link>
			))}
		</div>
	);
}

const TENTATEK_BRAND_ID = "B10";
const TAKOROKA_BRAND_ID = "B11";

function XRankPeaks({
	peaks,
}: {
	peaks: Extract<LoadedWidget, { id: "x-rank-peaks" }>["data"];
}) {
	return (
		<div className={styles.xRankPeaks}>
			{peaks.map((peak) => (
				<div key={peak.mode} className={styles.xRankPeakMode}>
					<div className={styles.xRankPeakModeIconWrapper}>
						<Image
							path={modeImageUrl(peak.mode as ModeShort)}
							alt=""
							width={24}
							height={24}
						/>
						<div className={styles.xRankPeakDivision}>
							<Image
								path={brandImageUrl(
									peak.region === "WEST"
										? TENTATEK_BRAND_ID
										: TAKOROKA_BRAND_ID,
								)}
								alt={peak.region === "WEST" ? "Tentatek" : "Takoroka"}
								width={12}
								height={12}
							/>
						</div>
					</div>
					<div>
						{peak.rank} / {peak.power.toFixed(1)}
					</div>
				</div>
			))}
		</div>
	);
}

function TimezoneWidget({ timezone }: { timezone: string }) {
	const [currentTime, setCurrentTime] = React.useState(() => new Date());

	React.useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 1000);

		return () => clearInterval(interval);
	}, []);

	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	});

	const dateFormatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		weekday: "short",
		day: "numeric",
		month: "short",
	});

	return (
		<div className="stack sm items-center">
			<div className={styles.widgetValueMain} suppressHydrationWarning>
				{formatter.format(currentTime)}
			</div>
			<div className={styles.widgetValueFooter} suppressHydrationWarning>
				{dateFormatter.format(currentTime)}
			</div>
		</div>
	);
}

function FavoriteStageWidget({ stageId }: { stageId: StageId }) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className="stack sm items-center">
			<StageImage stageId={stageId} width={225} className="rounded" />
			<div className={styles.widgetValueFooter}>
				{t(`game-misc:STAGE_${stageId}`)}
			</div>
		</div>
	);
}

function PlacementResults({
	data,
}: {
	data: NonNullable<Extract<LoadedWidget, { id: "placement-results" }>["data"]>;
}) {
	return (
		<div className={styles.placementResults}>
			{data.placements.map(({ placement, count }) => {
				return (
					<div key={placement} className={styles.placementResult}>
						<Placement placement={placement} />
						<span>×{count}</span>
					</div>
				);
			})}
		</div>
	);
}

function Builds({
	builds,
}: {
	builds: Extract<LoadedWidget, { id: "builds" }>["data"];
}) {
	return (
		<div className={styles.builds}>
			{builds.map((build) => (
				<BuildCard key={build.id} build={build} canEdit={false} />
			))}
		</div>
	);
}

function WeaponPool({
	weapons,
}: {
	weapons: Array<{ id: MainWeaponId; isFavorite: boolean }>;
}) {
	return (
		<div className="stack horizontal sm justify-center flex-wrap">
			{weapons.map((weapon) => {
				return (
					<div key={weapon.id} className="u__weapon">
						<WeaponImage
							weaponSplId={weapon.id}
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

function PeakXpWeapon({
	weaponSplId,
	peakXp,
	leaderboardPosition,
}: {
	weaponSplId: MainWeaponId;
	peakXp: number;
	leaderboardPosition: number | null;
}) {
	return (
		<div className={styles.peakValue}>
			<div className="stack horizontal sm items-center justify-center mb-2">
				<WeaponImage weaponSplId={weaponSplId} variant="badge" size={48} />
			</div>
			<div className={styles.widgetValueMain}>{peakXp} XP</div>
			{leaderboardPosition ? (
				<div className={styles.widgetValueFooter}>#{leaderboardPosition}</div>
			) : null}
		</div>
	);
}

function SensWidget({
	data,
}: {
	data: Extract<LoadedWidget, { id: "sens" }>["data"];
}) {
	const { t } = useTranslation(["user"]);

	const rawSensToString = (sens: number) =>
		`${sens > 0 ? "+" : ""}${sens / 10}`;

	return (
		<div className="stack md items-center">
			<img
				src={controllerImageUrl(data.controller)}
				alt={t(`user:controllers.${data.controller}`)}
				height={50}
			/>
			<div className="stack xs items-center">
				<div className="stack horizontal md">
					<div className="stack xs items-center">
						<div className="text-xs text-lighter">{t("user:motionSens")}</div>
						<div className={styles.widgetValueMain}>
							{typeof data.motionSens === "number"
								? rawSensToString(data.motionSens)
								: "-"}
						</div>
					</div>
					<div className="stack xs items-center">
						<div className="text-xs text-lighter">{t("user:stickSens")}</div>
						<div className={styles.widgetValueMain}>
							{typeof data.stickSens === "number"
								? rawSensToString(data.stickSens)
								: "-"}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function ArtWidget({
	arts,
}: {
	arts: Extract<LoadedWidget, { id: "art" }>["data"];
}) {
	return (
		<div className={styles.artGrid}>
			{arts.map((art) => (
				<img
					key={art.id}
					alt=""
					src={previewUrl(art.url)}
					loading="lazy"
					className={styles.artThumbnail}
				/>
			))}
		</div>
	);
}

function CommissionsWidget({
	data,
}: {
	data: Extract<LoadedWidget, { id: "commissions" }>["data"];
}) {
	const { t } = useTranslation(["user"]);

	if (!data) return null;

	const isOpen = data.commissionsOpen === 1;

	return (
		<div className="stack sm items-center">
			<div className={styles.widgetValueMain}>
				{isOpen ? t("user:commissions.open") : t("user:commissions.closed")}
			</div>
			{data.commissionText ? (
				<div className={styles.widgetValueFooter}>{data.commissionText}</div>
			) : null}
		</div>
	);
}

const urlToLinkType = (url: string) => {
	if (url.includes("twitch.tv")) {
		return "twitch";
	}
	if (url.includes("youtube.com")) {
		return "youtube";
	}
	if (url.includes("bsky.app")) {
		return "bsky";
	}
	return null;
};

const urlToIcon = (url: string) => {
	const type = urlToLinkType(url);
	if (type === "twitch") {
		return <TwitchIcon />;
	}
	if (type === "youtube") {
		return <YouTubeIcon />;
	}
	if (type === "bsky") {
		return <BskyIcon />;
	}
	return <LinkIcon />;
};

function SocialLinksWidget({
	data,
}: {
	data: Extract<LoadedWidget, { id: "social-links" }>["data"];
}) {
	if (data.length === 0) return null;

	return (
		<div className={styles.socialLinksIcons}>
			{data.map((link, i) => {
				if (link.type === "popover") {
					return (
						<SendouPopover
							key={i}
							trigger={
								<SendouButton
									variant="minimal"
									className={clsx(
										styles.socialLinkIconContainer,
										styles[link.platform],
									)}
								>
									{link.platform === "discord" ? <DiscordIcon /> : null}
								</SendouButton>
							}
						>
							{link.value}
						</SendouPopover>
					);
				}

				const type = urlToLinkType(link.value);
				return (
					<a
						key={i}
						href={link.value}
						target="_blank"
						rel="noreferrer"
						className={clsx(styles.socialLinkIconContainer, {
							[styles.twitch]: type === "twitch",
							[styles.youtube]: type === "youtube",
							[styles.bsky]: type === "bsky",
						})}
					>
						{urlToIcon(link.value)}
					</a>
				);
			})}
		</div>
	);
}

function LinksWidget({ links }: { links: string[] }) {
	return (
		<div className={styles.socialLinks}>
			{links.map((url, i) => {
				const type = urlToLinkType(url);
				return (
					<a
						key={i}
						href={url}
						target="_blank"
						rel="noreferrer"
						className={styles.socialLink}
					>
						<div
							className={clsx(styles.socialLinkIconContainer, {
								[styles.twitch]: type === "twitch",
								[styles.youtube]: type === "youtube",
								[styles.bsky]: type === "bsky",
							})}
						>
							{urlToIcon(url)}
						</div>
						{url}
					</a>
				);
			})}
		</div>
	);
}

function TierListWidget({ searchParams }: { searchParams: string }) {
	const fullUrl = `/tier-list-maker?${searchParams}`;
	const parsedUrl = new URL(fullUrl, "https://sendou.ink");
	const title = parsedUrl.searchParams.get("title");
	const { t } = useTranslation(["user"]);

	return (
		<div className={styles.socialLinks}>
			<Link to={fullUrl} className={styles.socialLink}>
				<div className={styles.socialLinkIconContainer}>
					<Image path={navIconUrl("tier-list-maker")} alt="" width={24} />
				</div>
				{title ? title : t("user:widget.tier-list.untitled")}
			</Link>
		</div>
	);
}

function GameBadgesDisplay({ badgeIds }: { badgeIds: string[] }) {
	const { t } = useTranslation(["game-badges"]);

	return (
		<div className={styles.gameBadgeGrid}>
			{badgeIds.map((id) => {
				const badgeId = id as GameBadgeId;
				return (
					<SendouPopover
						key={id}
						trigger={
							<SendouButton
								variant="minimal"
								className={styles.gameBadgeButton}
							>
								<img
									src={gameBadgeUrl(id)}
									alt={t(`game-badges:${badgeId}`)}
									className={styles.gameBadgeImage}
									loading="lazy"
								/>
							</SendouButton>
						}
					>
						{t(`game-badges:${badgeId}`)}
					</SendouPopover>
				);
			})}
		</div>
	);
}
