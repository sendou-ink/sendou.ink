import clsx from "clsx";
import { ShieldMinus, Users } from "lucide-react";
import { lazy } from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Flag } from "~/components/Flag";
import { Image, ModeImage } from "~/components/Image";
import { TierPill } from "~/components/TierPill";
import { VenueLocaleTime } from "~/components/VenueLocaleTime";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import type { TrophyModelLoaderData } from "~/features/trophies/routes/trophies.$id.model";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { useVenueTimeFormat } from "~/hooks/intl/useVenueTimeFormat";
import { useHydrated } from "~/hooks/useHydrated";
import { useSpoilerFree } from "~/hooks/useSpoilerFree";
import { databaseTimestampToDate } from "~/utils/dates";
import { navIconUrl, smallImageUrl, trophyModelPage } from "~/utils/urls";
import type { CalendarEvent, ShowcaseCalendarEvent } from "../calendar-types";
import { Tags } from "./Tags";
import styles from "./TournamentCard.module.css";

// lazy so the WebGL renderer stays out of every tournament card page's eager bundle; it only renders inside a popover
const Trophy = lazy(() =>
	import("~/features/trophies/components/Trophy").then((module) => ({
		default: module.Trophy,
	})),
);

export function TournamentCard({
	tournament,
	className,
	timeFormat = "relative",
}: {
	tournament: CalendarEvent | ShowcaseCalendarEvent;
	className?: string;
	timeFormat?: "relative" | "absolute";
}) {
	const isHydrated = useHydrated();
	const formatDistanceToNow = useFormatDistanceToNow();
	const { isCensored, reveal } = useSpoilerFree();
	const { format: formatVenueTime } = useVenueTimeFormat(
		{ weekday: "short", hour: "numeric", minute: "numeric" },
		tournament.venue?.timezone,
	);

	const isShowcase = tournament.type === "showcase";
	const isCalendar = tournament.type === "calendar";
	const isHostedOnSendouInk = typeof tournament.isRanked === "boolean";
	const modes =
		isCalendar && tournament.modes && tournament.modes.length > 0
			? tournament.modes
			: null;

	const startDate = isShowcase
		? databaseTimestampToDate(tournament.startsAt)
		: null;
	// the calendar groups events under the viewer's time already, a LAN's own only shows when it differs
	const calendarVenueTime =
		tournament.type === "calendar" && tournament.venue
			? { at: tournament.at, ...formatVenueTime(new Date(tournament.at)) }
			: null;

	return (
		<div
			className={clsx(className, styles.container, {
				[styles.containerTall]:
					isShowcase && tournament.firstPlacers.length > 0,
			})}
			data-testid="tournament-card"
		>
			<Link
				to={tournament.url}
				className={clsx(styles.card, {
					[styles.cardRanked]: tournament.isRanked === true,
				})}
			>
				<div className="stack horizontal justify-between">
					{tournament.logoUrl ? (
						<div className={styles.imgContainer}>
							<img
								src={smallImageUrl(tournament.logoUrl)}
								width={32}
								height={32}
								className={styles.avatarImg}
								alt=""
								loading="lazy"
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
						className={clsx(styles.name, "truncate", {
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
				{startDate ? (
					timeFormat === "absolute" ? (
						<VenueLocaleTime
							date={startDate}
							venueTimezone={tournament.venue?.timezone}
							className={styles.time}
							options={{
								month: "short",
								day: "numeric",
								weekday: "short",
								hour: "numeric",
								minute: "numeric",
							}}
						/>
					) : (
						<time
							className={clsx(styles.time, {
								invisible: !isHydrated,
							})}
							dateTime={startDate.toISOString()}
						>
							{isHydrated
								? formatDistanceToNow(startDate, { addSuffix: true })
								: "Placeholder"}
						</time>
					)
				) : null}
				{calendarVenueTime?.viewer ? (
					<time
						className={styles.time}
						dateTime={new Date(calendarVenueTime.at).toISOString()}
					>
						{calendarVenueTime.venue}
					</time>
				) : null}
				{isCalendar ? (
					<div className="stack sm items-center my-2">
						<Tags tags={tournament.tags} small centered maxVisible={2} />
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
				{modes ? <ModesRow modes={modes} /> : null}
				<div className={styles.pillsContainer}>
					{tournament.trophyId !== null ||
					(tournament.badges && tournament.badges.length > 0) ? (
						<PrizesPill
							badges={tournament.badges}
							trophyId={tournament.trophyId}
						/>
					) : null}
					{isHostedOnSendouInk ? (
						<ParticipantsPill
							teamsCount={tournament.teamsCount}
							membersCount={tournament.membersCount}
							minMembersPerTeam={tournament.minMembersPerTeam}
						/>
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
					{firstPlacers.map((firstPlacer) => (
						<TournamentFirstPlacerTeamNameOnly
							key={`${firstPlacer.div}-${firstPlacer.teamName}`}
							placer={firstPlacer}
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
						src={smallImageUrl(placer.logoUrl)}
						alt=""
						width={24}
						className="rounded-full"
						loading="lazy"
					/>
				) : null}{" "}
				<div className="stack items-start">
					<span className={clsx(styles.firstPlacersTeamName, "truncate")}>
						{censored ? "???" : placer.teamName}
					</span>
					<div className="text-xxs text-lighter font-bold text-uppercase">
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
			<span className={clsx(styles.firstPlacersTeamName, "truncate")}>
				{censored ? "???" : placer.teamName}
			</span>
			<div className="text-xxs text-lighter font-bold text-uppercase">
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
			onClick={onReveal}
			icon={<ShieldMinus />}
		>
			{t("common:actions.reveal")}
		</SendouButton>
	);
}

function ParticipantsPill({
	teamsCount,
	membersCount,
	minMembersPerTeam,
}: {
	teamsCount: number;
	membersCount: number;
	minMembersPerTeam: number;
}) {
	const isSolo = minMembersPerTeam === 1;

	return (
		<div className={styles.participantsPill}>
			<Users />
			<span>
				{isSolo ? teamsCount : membersCount}
				{isSolo ? null : (
					<span className={styles.participantsTeamsCount}>/{teamsCount}</span>
				)}
			</span>
		</div>
	);
}

function ModesRow({ modes }: { modes: NonNullable<CalendarEvent["modes"]> }) {
	return (
		<div className={styles.modesRow}>
			{modes.map((mode) => (
				<ModeImage key={mode} mode={mode} size={18} />
			))}
		</div>
	);
}

function PrizesPill({
	badges,
	trophyId,
}: {
	badges: CalendarEvent["badges"];
	trophyId: CalendarEvent["trophyId"];
}) {
	const trophyFetcher = useFetcher<TrophyModelLoaderData>();

	const loadTrophyModel = (isOpen: boolean) => {
		if (
			!isOpen ||
			trophyId === null ||
			trophyFetcher.data ||
			trophyFetcher.state !== "idle"
		) {
			return;
		}

		trophyFetcher.load(trophyModelPage(trophyId));
	};

	return (
		<SendouPopover
			onOpenChange={loadTrophyModel}
			trigger={
				<SendouButton
					variant="minimal"
					size="miniscule"
					className={styles.badgePill}
				>
					<Image
						size={18}
						path={
							trophyId !== null ? navIconUrl("trophies") : navIconUrl("badges")
						}
						alt="Badge prizes"
						className={styles.badgeNavIcon}
					/>
				</SendouButton>
			}
		>
			{trophyId !== null ? (
				trophyFetcher.data ? (
					<Trophy model={trophyFetcher.data.model} />
				) : (
					<div className={styles.trophyLoading} aria-busy />
				)
			) : badges ? (
				<BadgeDisplay badges={badges} showText={false} compact />
			) : null}
		</SendouPopover>
	);
}
