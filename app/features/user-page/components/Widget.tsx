import { Link } from "@remix-run/react";
import clsx from "clsx";
import Markdown from "markdown-to-jsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Image, WeaponImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import type { Tables } from "~/db/tables";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { VodListing } from "~/features/vods/components/VodListing";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import type { MainWeaponId, ModeShort } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { assertUnreachable } from "~/utils/types";
import {
	brandImageUrl,
	calendarEventPage,
	LFG_PAGE,
	modeImageUrl,
	teamPage,
	topSearchPlayerPage,
	tournamentBracketsPage,
	tournamentOrganizationPage,
	userVodsPage,
} from "~/utils/urls";
import type { LoadedWidget } from "../core/widgets/types";
import styles from "./Widget.module.css";

// xxx: make side widgets sticky

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
						<Markdown options={{ wrapper: React.Fragment }}>
							{widget.data.bio}
						</Markdown>
					</article>
				);
			case "badges-owned":
				return <BadgeDisplay badges={widget.data} />;
			case "badges-authored":
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
			case "peak-xp":
				if (!widget.data) return null;
				return (
					<BigValue
						value={widget.data.peakXp}
						unit="XP"
						footer={`${widget.data.division}${widget.data.topRating ? ` / #${widget.data.topRating}` : ""}`}
					/>
				);
			case "highlighted-results":
				return widget.data.length === 0 ? null : (
					<HighlightedResults results={widget.data} />
				);
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
			<div className={styles.peakValueMain}>
				{value} {unit ? unit : null}
			</div>
			{footer ? <div className={styles.peakValueFooter}>{footer}</div> : null}
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
