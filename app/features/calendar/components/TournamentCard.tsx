import { Link } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Flag } from "~/components/Flag";
import { UsersIcon } from "~/components/icons/Users";
import { HACKY_resolvePicture } from "~/features/tournament/tournament-utils";
import { useIsMounted } from "~/hooks/useIsMounted";
import { databaseTimestampToDate } from "~/utils/dates";
import { userSubmittedImage } from "~/utils/urls";
import type { CalendarEvent, ShowcaseCalendarEvent } from "../calendar-types";

export function TournamentCard({
	tournament,
	className,
}: {
	tournament: CalendarEvent | ShowcaseCalendarEvent;
	className?: string;
}) {
	const isMounted = useIsMounted();
	const { t, i18n } = useTranslation(["front", "common"]);

	const isShowcase = tournament.type === "showcase";
	// const isCalendar = tournament.type === "calendar";

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
			className={clsx(className, "front__tournament-card__container", {
				"front__tournament-card__container__tall":
					isShowcase && tournament.firstPlacer,
			})}
		>
			<Link to={tournament.url} className="front__tournament-card">
				<div className="stack horizontal justify-between">
					<div className="front__tournament-card__img-container">
						<img
							src={
								tournament.logoUrl
									? userSubmittedImage(tournament.logoUrl)
									: HACKY_resolvePicture(tournament)
							}
							width={32}
							height={32}
							className="front__tournament-card__tournament-avatar-img"
							alt=""
						/>
					</div>
					{tournament.organization ? (
						<div className="front__tournament-card__org">
							{tournament.organization.name}
						</div>
					) : null}
				</div>
				<div className="front__tournament-card__name">
					{tournament.name}{" "}
					{isShowcase ? (
						<time
							className={clsx("front__tournament-card__time", {
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
				{isShowcase && tournament.firstPlacer ? (
					<TournamentFirstPlacers firstPlacer={tournament.firstPlacer} />
				) : null}
			</Link>
			<div className="stack horizontal xxs justify-end">
				<div className="front__tournament-card__team-count">
					<UsersIcon /> {tournament.teamsCount}
				</div>
				{tournament.isRanked ? (
					<div className="front__tournament-card__tag front__tournament-card__ranked">
						{t("front:showcase.card.ranked")}
					</div>
				) : tournament.isRanked === false ? (
					<div className="front__tournament-card__tag front__tournament-card__unranked">
						{t("front:showcase.card.unranked")}
					</div>
				) : null}
			</div>
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
		<div className="front__tournament-card__first-placers">
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
					<span className="front__tournament-card__first-placers__team-name">
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
