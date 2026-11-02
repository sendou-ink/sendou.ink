import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Image, ModeImage, StageImage, WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { SiteLogoMark } from "~/components/SiteLogoMark";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { truncateWithOverflow } from "~/utils/arrays";
import type { CommonUser } from "~/utils/kysely.server";
import {
	type NavIcon,
	navIconUrl,
	tournamentPage,
	userPage,
} from "~/utils/urls";
import styles from "./FeedParts.module.css";

export function UserName({
	user,
}: {
	user: Pick<CommonUser, "id" | "username" | "customUrl">;
}) {
	return (
		<Link to={userPage(user)} className={styles.userName}>
			{user.username}
		</Link>
	);
}

export function UserStack({
	users,
	max = 5,
}: {
	users: Array<Pick<CommonUser, "id" | "avatar">>;
	max?: number;
}) {
	const { shown, hiddenCount } = truncateWithOverflow(users, max);

	return (
		<span className={styles.stack}>
			{shown.map((user) => (
				<Avatar
					key={user.id}
					user={user}
					size="xxs"
					className={styles.stackAvatar}
				/>
			))}
			{hiddenCount > 0 ? (
				<span className={styles.stackMore}>+{hiddenCount}</span>
			) : null}
		</span>
	);
}

export function LogoAvatar({
	url,
	name,
	size = "xs",
}: {
	url: string | null;
	name: string;
	size?: "xxs" | "xs" | "sm" | "xsm";
}) {
	return (
		<Avatar
			url={url}
			identiconInput={name}
			size={size}
			className={styles.logo}
		/>
	);
}

/** Post avatar of sendou.ink itself */
export function SiteLogoAvatar() {
	return <SiteLogoMark className={styles.siteLogo} />;
}

/** Post avatar of a site feature, for posts not about any one user */
export function NavIconAvatar({ navIcon }: { navIcon: NavIcon }) {
	return <Image path={navIconUrl(navIcon)} alt="" size={36} />;
}

export function WinLoss({ isWin }: { isWin: boolean }) {
	return (
		<span className={clsx(styles.winLoss, isWin ? styles.win : styles.loss)}>
			{isWin ? "W" : "L"}
		</span>
	);
}

export function MapTiles({
	maps,
	max = 6,
}: {
	maps: Array<{ mode: ModeShort; stageId: StageId; isWin?: boolean }>;
	max?: number;
}) {
	return (
		<>
			<div className={styles.maps}>
				{maps.slice(0, max).map((map, i) => (
					<div
						key={i}
						className={clsx(styles.map, {
							[styles.mapLost]: map.isWin === false,
						})}
					>
						<StageImage
							stageId={map.stageId}
							className={styles.mapStage}
							containerClassName={styles.mapStageContainer}
							width={160}
						/>
						<span className={styles.mapOverlay} />
						<ModeImage mode={map.mode} size={16} className={styles.mapMode} />
						{map.isWin !== undefined ? (
							<span className={styles.mapResult}>
								<WinLoss isWin={map.isWin} />
							</span>
						) : null}
					</div>
				))}
			</div>
			{maps.length > max ? (
				<div className="text-xs text-lighter">
					+{maps.length - max} more maps
				</div>
			) : null}
		</>
	);
}

export function WeaponSlot({
	weaponSplId,
}: {
	weaponSplId: MainWeaponId | null;
}) {
	return (
		<span className={styles.weaponSlot}>
			{weaponSplId !== null ? (
				<WeaponImage weaponSplId={weaponSplId} variant="build" size={24} />
			) : (
				"?"
			)}
		</span>
	);
}

export function WeaponName({ weaponSplId }: { weaponSplId: MainWeaponId }) {
	const { t } = useTranslation(["weapons"]);

	return <>{t(`weapons:MAIN_${weaponSplId}`)}</>;
}

export function StageName({ stageId }: { stageId: StageId }) {
	const { t } = useTranslation(["game-misc"]);

	return <>{t(`game-misc:STAGE_${stageId}`)}</>;
}

export function TournamentRow({
	tournament,
}: {
	tournament?: {
		tournamentId: number | null;
		name: string;
		logoUrl: string;
		organizationName: string | null;
		startsAt: number | null;
	};
}) {
	if (!tournament?.tournamentId) return null;

	return (
		<div className={styles.tournamentRow}>
			<LogoAvatar url={tournament.logoUrl} name={tournament.name} size="xs" />
			<div className={styles.grow}>
				<Link
					to={tournamentPage(tournament.tournamentId)}
					className={styles.strongLink}
				>
					{tournament.name}
				</Link>
				<div className="text-xs text-lighter">
					{tournament.organizationName
						? `${tournament.organizationName} · `
						: null}
					{tournament.startsAt ? (
						<LocaleTime
							inline
							date={tournament.startsAt}
							options={{ weekday: "short", month: "short", day: "numeric" }}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function DateBlock({ at }: { at: number }) {
	return (
		<div className={styles.dateBlock}>
			<div className={styles.dateBlockTop}>
				<LocaleTime date={at} options={{ month: "short" }} />
			</div>
			<div className={styles.dateBlockDay}>
				<LocaleTime date={at} options={{ day: "numeric" }} />
			</div>
		</div>
	);
}

export function DayTime({ at }: { at: number }) {
	return (
		<LocaleTime
			inline
			date={at}
			options={{
				weekday: "short",
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
			}}
		/>
	);
}

/** Short English relative time against the feed's own "now", e.g. "3h ago". */
export function relativeTime(at: number, now: number) {
	const seconds = now - at;
	if (seconds < 0) return `in ${durationText(-seconds)}`;
	if (seconds < 90) return "just now";

	return `${durationText(seconds)} ago`;
}

/** Short English duration, e.g. "45m" or "3d". */
export function durationText(seconds: number) {
	if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
	if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;

	return `${Math.round(seconds / 86400)}d`;
}

export function ordinalPlacement(placement: number) {
	const suffixes = ["th", "st", "nd", "rd"];
	const lastTwo = placement % 100;

	return `${placement}${suffixes[(lastTwo - 20) % 10] ?? suffixes[lastTwo] ?? suffixes[0]}`;
}

/** English number with thousands separators, e.g. "100,000". */
export function groupedNumber(value: number) {
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function tierLabel(tier: { name: string; isPlus: boolean }) {
	return `${tier.name[0]}${tier.name.slice(1).toLowerCase()}${tier.isPlus ? "+" : ""}`;
}
