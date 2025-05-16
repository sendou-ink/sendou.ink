import { Link } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Flag } from "~/components/Flag";
import { TrophyIcon } from "~/components/icons/Trophy";
import { UsersIcon } from "~/components/icons/Users";
import { HACKY_resolvePicture } from "~/features/tournament/tournament-utils";
import { useIsMounted } from "~/hooks/useIsMounted";
import { databaseTimestampToDate } from "~/utils/dates";
import { userSubmittedImage } from "~/utils/urls";
import type { CalendarEvent, ShowcaseCalendarEvent } from "../calendar-types";
import { Tags } from "./Tags";
import styles from "./TournamentCard.module.css";

export function TournamentCard({
	tournament,
	className,
}: {
	tournament: CalendarEvent | ShowcaseCalendarEvent;
	className?: string;
}) {
	const isMounted = useIsMounted();
	const { i18n } = useTranslation(["front", "common"]);

	const isShowcase = tournament.type === "showcase";
	const isCalendar = tournament.type === "calendar";
	const isHostedOnSendouInk = typeof tournament.isRanked === "boolean";

	const time = () => {
		if (!isShowcase) return null;
		if (!isMounted) return "Placeholder";

		const date = databaseTimestampToDate(tournament.startTime);
		return date.toLocaleString(i18n.language, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			weekday: "short",
			minute: date.getMinutes() !== 0 ? "numeric" : undefined,
		});
	};

	return (
		<div
			className={clsx(className, styles.container, {
				[styles.containerTall]: isShowcase && tournament.firstPlacer,
			})}
		>
			<Link to={tournament.url} className={styles.card}>
				<div className="stack horizontal justify-between">
					{isHostedOnSendouInk ? (
						<div className={styles.imgContainer}>
							<img
								src={
									tournament.logoUrl
										? userSubmittedImage(tournament.logoUrl)
										: HACKY_resolvePicture(tournament)
								}
								width={32}
								height={32}
								className={styles.avatarImg}
								alt=""
							/>
						</div>
					) : null}
					{tournament.organization ? (
						<div className={styles.org}>{tournament.organization.name}</div>
					) : null}
				</div>
				<div
					className={clsx(styles.name, {
						"mt-3": !isHostedOnSendouInk,
						"mt-1": isHostedOnSendouInk,
					})}
				>
					{tournament.name}{" "}
					{isShowcase ? (
						<time
							className={clsx(styles.time, {
								invisible: !isMounted,
							})}
							dateTime={databaseTimestampToDate(
								tournament.startTime,
							).toISOString()}
						>
							{time()}
						</time>
					) : null}
				</div>
				{isCalendar ? (
					<div className="stack sm items-center my-2">
						<Tags tags={tournament.tags} small centered />
					</div>
				) : null}
				{isShowcase && tournament.firstPlacer ? (
					<TournamentFirstPlacers firstPlacer={tournament.firstPlacer} />
				) : null}
			</Link>
			{isHostedOnSendouInk ? (
				<div className={styles.pillsContainer}>
					{tournament.isRanked ? (
						<div className={clsx(styles.pill, styles.pillRanked)}>
							<TrophyIcon title="Ranked (impacts this seasons SP)" />
						</div>
					) : null}
					<div className={styles.teamCount}>
						<UsersIcon /> {tournament.teamsCount}
					</div>
				</div>
			) : null}
		</div>
	);
}

function TournamentFirstPlacers({
	firstPlacer,
}: {
	firstPlacer: NonNullable<ShowcaseCalendarEvent["firstPlacer"]>;
}) {
	const { t } = useTranslation(["front"]);

	return (
		<div className={styles.firstPlacers}>
			<div className="stack xs horizontal items-center text-xs">
				{firstPlacer.logoUrl ? (
					<img
						src={userSubmittedImage(firstPlacer.logoUrl)}
						alt=""
						width={24}
						className="rounded-full"
					/>
				) : null}{" "}
				<div className="stack items-start">
					<span className={styles.firstPlacersTeamName}>
						{firstPlacer.teamName}
					</span>
					<div className="text-xxxs text-lighter font-bold text-uppercase">
						{t("front:showcase.card.winner")}
					</div>
				</div>
			</div>
			<div className="text-xxs stack items-start mt-1">
				{firstPlacer.members.map((member) => (
					<div key={member.id} className="stack horizontal xs items-center">
						{member.country ? <Flag tiny countryCode={member.country} /> : null}
						{member.username}{" "}
					</div>
				))}
				{firstPlacer.notShownMembersCount > 0 ? (
					<div className="font-bold text-lighter">
						+{firstPlacer.notShownMembersCount}
					</div>
				) : null}
			</div>
		</div>
	);
}
