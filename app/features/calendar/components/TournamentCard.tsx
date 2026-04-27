import clsx from "clsx";
import { ShieldMinus, Trophy as TrophyIcon, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Flag } from "~/components/Flag";
import { Image, ModeImage } from "~/components/Image";
import { TierPill } from "~/components/TierPill";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { Trophy } from "~/features/trophies/components/Trophy";
import { useHydrated } from "~/hooks/useHydrated";
import { useSpoilerFree } from "~/hooks/useSpoilerFree";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import { navIconUrl } from "~/utils/urls";
import type { CalendarEvent, ShowcaseCalendarEvent } from "../calendar-types";
import { Tags } from "./Tags";
import styles from "./TournamentCard.module.css";

export function TournamentCard({
	tournament,
	className,
	withRelativeTime = false,
}: {
	tournament: CalendarEvent | ShowcaseCalendarEvent;
	className?: string;
	withRelativeTime?: boolean;
}) {
	const isHydrated = useHydrated();
	const { formatDateTimeSmartMinutes, formatDistanceToNow } = useTimeFormat();
	const { isCensored, reveal } = useSpoilerFree();

	const isShowcase = tournament.type === "showcase";
	const isCalendar = tournament.type === "calendar";
	const isHostedOnSendouInk = typeof tournament.isRanked === "boolean";

	const time = () => {
		if (!isShowcase) return null;
		if (!isHydrated) return "Placeholder";

		const date = databaseTimestampToDate(tournament.startTime);

		if (withRelativeTime) {
			return formatDistanceToNow(date, {
				addSuffix: true,
			});
		}

		return formatDateTimeSmartMinutes(date, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			weekday: "short",
		});
	};

	return (
		<div
			className={clsx(className, styles.container, {
				[styles.containerTall]:
					isShowcase && tournament.firstPlacers.length > 0,
			})}
			data-testid="tournament-card"
		>
			<Link to={tournament.url} className={styles.card}>
				<div className="stack horizontal justify-between">
					{tournament.logoUrl ? (
						<div className={styles.imgContainer}>
							<img
								src={tournament.logoUrl}
								width={32}
								height={32}
								className={styles.avatarImg}
								alt=""
							/>
						</div>
					) : null}
					{tournament.organization ? (
						<div className={styles.org}>
							<span>{tournament.organization.name}</span>
						</div>
					) : null}
				</div>
				<div
					className={clsx(styles.nameRow, {
						"mt-3": !isHostedOnSendouInk,
						"mt-1": isHostedOnSendouInk,
					})}
				>
					<div
						className={clsx(styles.name, {
							[styles.nameWithTier]:
								tournament.tier || tournament.tentativeTier,
						})}
					>
						{tournament.name}
					</div>
					{tournament.tier ? (
						<TierPill tier={tournament.tier} />
					) : tournament.tentativeTier ? (
						<TierPill tier={tournament.tentativeTier} isTentative />
					) : null}
				</div>
				{isShowcase ? (
					<time
						className={clsx(styles.time, {
							invisible: !isHydrated,
						})}
						dateTime={databaseTimestampToDate(
							tournament.startTime,
						).toISOString()}
					>
						{time()}
					</time>
				) : null}
				{isCalendar ? (
					<div className="stack sm items-center my-2">
						<Tags tags={tournament.tags} small centered />
					</div>
				) : null}
				{isShowcase && tournament.firstPlacers.length > 0 ? (
					<TournamentFirstPlacers
						firstPlacers={tournament.firstPlacers}
						censored={isCensored(tournament.id)}
					/>
				) : null}
			</Link>
			<div className="stack horizontal justify-between items-center">
				{isShowcase &&
				tournament.firstPlacers.length > 0 &&
				isCensored(tournament.id) ? (
					<SpoilerRevealPill onReveal={() => reveal(tournament.id)} />
				) : null}
				{isShowcase && "hasVods" in tournament && tournament.hasVods ? (
					<div className={styles.vodIndicator}>📺 VODs</div>
				) : null}
				{tournament.modes ? <ModesPill modes={tournament.modes} /> : null}
				<div
					className={clsx(styles.pillsContainer, {
						[styles.lonely]: !tournament.modes && isHostedOnSendouInk,
					})}
				>
					{tournament.isRanked ? (
						<div className={clsx(styles.pill, styles.pillRanked)}>
							<TrophyIcon />
						</div>
					) : null}
					{isCalendar &&
					(tournament.trophy ||
						(tournament.badges && tournament.badges.length > 0)) ? (
						<PrizesPill
							badges={tournament.badges}
							trophy={tournament.trophy?.model}
						/>
					) : null}
					{isHostedOnSendouInk ? (
						<div className={styles.teamCount}>
							<Users /> {tournament.teamsCount}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

function TournamentFirstPlacers({
	firstPlacers,
	censored,
}: {
	firstPlacers: ShowcaseCalendarEvent["firstPlacers"];
	censored: boolean;
}) {
	if (firstPlacers.length > 1) {
		return (
			<div className={styles.firstPlacers}>
				<div className="stack md items-start">
					{firstPlacers.map((placer) => (
						<TournamentFirstPlacerTeamNameOnly
							key={placer.div ?? placer.teamName}
							placer={placer}
							censored={censored}
						/>
					))}
				</div>
			</div>
		);
	}

	const placer = firstPlacers[0];

	return (
		<div className={styles.firstPlacers}>
			<TournamentFirstPlacerWithMembers placer={placer} censored={censored} />
		</div>
	);
}

function TournamentFirstPlacerWithMembers({
	placer,
	censored,
}: {
	placer: ShowcaseCalendarEvent["firstPlacers"][number];
	censored: boolean;
}) {
	const { t } = useTranslation(["front"]);

	return (
		<>
			<div className="stack xs horizontal items-center text-xs">
				{!censored && placer.logoUrl ? (
					<img
						src={placer.logoUrl}
						alt=""
						width={24}
						className="rounded-full"
					/>
				) : null}{" "}
				<div className="stack items-start">
					<span className={styles.firstPlacersTeamName}>
						{censored ? "???" : placer.teamName}
					</span>
					<div className="text-xxxs text-lighter font-bold text-uppercase">
						{t("front:showcase.card.winner")}
						{placer.div ? ` (${placer.div})` : null}
					</div>
				</div>
			</div>
			<div className="text-xxs stack items-start mt-1">
				{placer.members.map((member) => (
					<div key={member.id} className="stack horizontal xs items-center">
						{!censored && member.country ? (
							<Flag tiny countryCode={member.country} />
						) : null}
						{censored ? "???" : member.username}{" "}
					</div>
				))}
				{!censored && placer.notShownMembersCount > 0 ? (
					<div className="font-bold text-lighter">
						+{placer.notShownMembersCount}
					</div>
				) : null}
			</div>
		</>
	);
}

function TournamentFirstPlacerTeamNameOnly({
	placer,
	censored,
}: {
	placer: ShowcaseCalendarEvent["firstPlacers"][number];
	censored: boolean;
}) {
	const { t } = useTranslation(["front"]);

	return (
		<div className="stack items-start">
			<span className={styles.firstPlacersTeamName}>
				{censored ? "???" : placer.teamName}
			</span>
			<div className="text-xxxs text-lighter font-bold text-uppercase">
				{t("front:showcase.card.winner")}
				{placer.div ? ` (${placer.div})` : null}
			</div>
		</div>
	);
}

function SpoilerRevealPill({ onReveal }: { onReveal: () => void }) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			variant="outlined"
			size="miniscule"
			onPress={onReveal}
			icon={<ShieldMinus />}
		>
			{t("common:actions.reveal")}
		</SendouButton>
	);
}

function ModesPill({ modes }: { modes: NonNullable<CalendarEvent["modes"]> }) {
	const size = 16;

	return (
		<div className={styles.modesPillContainer}>
			<div className={styles.modesPill}>
				{modes.map((mode) => (
					<ModeImage key={mode} mode={mode} size={size} />
				))}
			</div>
		</div>
	);
}

function PrizesPill({
	badges,
	trophy,
}: {
	badges: CalendarEvent["badges"];
	trophy?: string;
}) {
	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					size="miniscule"
					className={styles.badgePill}
				>
					<Image
						size={16}
						path={trophy ? navIconUrl("trophies") : navIconUrl("badges")}
						alt="Badge prizes"
						className={styles.badgeNavIcon}
					/>
				</SendouButton>
			}
		>
			{trophy ? (
				<Trophy model={trophy} className={styles.trophyPreview} />
			) : badges ? (
				<BadgeDisplay
					badges={badges}
					showText={false}
					className={styles.badgeDisplay}
				/>
			) : null}
		</SendouPopover>
	);
}
