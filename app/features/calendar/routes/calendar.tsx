import type { MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import {
	SendouButton,
	type SendouButtonProps,
} from "~/components/elements/Button";
import { ArrowLeftIcon } from "~/components/icons/ArrowLeft";
import { ArrowRightIcon } from "~/components/icons/ArrowRight";
import { EyeIcon } from "~/components/icons/Eye";
import { EyeSlashIcon } from "~/components/icons/EyeSlash";
import { DAYS_SHOWN_AT_A_TIME } from "~/features/calendar/calendar-constants";
import { useCollapsableEvents } from "~/features/calendar/calendar-hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE, navIconUrl } from "~/utils/urls";
import { daysForCalendar } from "../calendar-utils";
import { FiltersDialog } from "../components/FiltersDialog";
import { TournamentCard } from "../components/TournamentCard";

import { type CalendarLoaderData, loader } from "../loaders/calendar.server";
export { loader };

import styles from "./calendar.module.css";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Calendar",
		ogTitle: "Splatoon competitive event calendar",
		location: args.location,
		description:
			"Browser Splatoon competitive tournaments and events both local and online. Events for players of all skill levels from newcomer to pro.",
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["calendar", "front"],
	breadcrumb: () => ({
		imgPath: navIconUrl("calendar"),
		href: CALENDAR_PAGE,
		type: "IMAGE",
	}),
};

export default function CalendarPage() {
	const data = useLoaderData<typeof loader>();

	const { previous, shown, next } = daysForCalendar(data.dateViewed);

	return (
		<Main bigger className="stack lg">
			<div className="stack horizontal items-start justify-between">
				<div className="stack md horizontal">
					<NavigateButton icon={<ArrowLeftIcon />} daysInterval={previous}>
						Previous
					</NavigateButton>
					<NavigateButton icon={<ArrowRightIcon />} daysInterval={next}>
						Next
					</NavigateButton>
					{/* <MajorTournamentLink /> */}
				</div>
				<FiltersDialog filters={data.filters} />
			</div>
			<div
				className={styles.columnsContainer}
				style={{ "--columns-count": DAYS_SHOWN_AT_A_TIME }}
			>
				{shown.map((date) => (
					<DayEventsColumn
						key={`${date.month}-${date.day}`}
						date={date.day}
						month={date.month}
						eventTimes={data.eventTimes.filter((event) => {
							const eventDate = new Date(event.at);

							return (
								eventDate.getDate() === date.day &&
								eventDate.getMonth() === date.month
							);
						})}
					/>
				))}
			</div>
		</Main>
	);
}

function NavigateButton({
	icon,
	children,
	daysInterval,
}: {
	icon: SendouButtonProps["icon"];
	children: React.ReactNode;
	daysInterval: ReturnType<typeof daysForCalendar>["shown"];
}) {
	const { i18n } = useTranslation();
	const lowestDate = daysInterval[0];
	const highestDate = daysInterval[daysInterval.length - 1];

	const dateToString = (
		day: ReturnType<typeof daysForCalendar>["shown"][number],
	) =>
		new Date(new Date().getFullYear(), day.month, day.day).toLocaleDateString(
			i18n.language,
			{
				day: "numeric",
				month: "short",
			},
		);

	const searchParamsString = () => {
		const searchParams = new URLSearchParams();

		searchParams.set("day", String(lowestDate.day));
		searchParams.set("month", String(lowestDate.month));
		searchParams.set("year", String(lowestDate.year));

		return `?${searchParams.toString()}`;
	};

	return (
		<Link to={searchParamsString()} className={styles.navigateButton}>
			{icon}
			<div>
				<div>{children}</div>
				<div className="text-xxs text-lighter">
					{dateToString(lowestDate)} - {dateToString(highestDate)}
				</div>
			</div>
		</Link>
	);
}

// xxx: get this from somewhere...
// xxx: finish this or scrap
// function _MajorTournamentLink() {
// 	return (
// 		<Link to="/" className={styles.majorLink}>
// 			<div>Superjump</div>
// 			<div className="text-xxs">
// 				{new Date().toLocaleString("en-US", {
// 					month: "long",
// 					day: "2-digit",
// 				})}
// 			</div>
// 		</Link>
// 	);
// }

function DayEventsColumn({
	date,
	month,
	eventTimes,
}: {
	date: number;
	month: number;
	eventTimes: CalendarLoaderData["eventTimes"];
}) {
	const eventTimesCollapesed = useCollapsableEvents(eventTimes);

	return (
		<div>
			<DayHeader date={date} month={month} />
			<div className={styles.dayEvents}>
				{eventTimesCollapesed.map((eventTime, i) => {
					return (
						<div key={eventTime.date.from.getTime()} className="stack md">
							<ClockHeader
								date={eventTime.date.from}
								toDate={eventTime.date.to}
								hiddenEventsCount={eventTime.hiddenCount}
								hiddenShown={eventTime.eventsShown.length > 0}
								onToggleHidden={eventTime.onToggleHidden}
								className={i !== 0 ? "mt-4" : undefined}
							/>
							{eventTime.eventsShown.map((event) => (
								<TournamentCard key={event.id} tournament={event} />
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function DayHeader(props: { date: number; month: number }) {
	const { i18n } = useTranslation();

	const date = new Date(new Date().getFullYear(), props.month, props.date);

	return (
		<div className={styles.dayHeader}>
			{date.toLocaleDateString(i18n.language, {
				day: "numeric",
				month: "long",
			})}
			<div className={styles.dayHeaderWeekday}>
				{date.toLocaleDateString(i18n.language, {
					weekday: "long",
				})}
			</div>
		</div>
	);
}

function ClockHeader({
	date,
	toDate,
	hiddenEventsCount = 0,
	onToggleHidden,
	hiddenShown,
	className,
}: {
	date: Date;
	toDate?: Date;
	hiddenEventsCount?: number;
	onToggleHidden: () => void;
	hiddenShown: boolean;
	className?: string;
}) {
	const { i18n } = useTranslation();

	const isInThePast = (toDate ?? date).getTime() < Date.now();

	return (
		<div className={clsx(className, styles.clockHeader)}>
			<div className="stack horizontal justify-between">
				<span
					className={clsx({
						"text-lighter italic": isInThePast,
					})}
				>
					{date.toLocaleTimeString(i18n.language, {
						hour: "numeric",
						minute: "2-digit",
					})}
					{toDate
						? ` - ${toDate.toLocaleTimeString(i18n.language, {
								hour: "numeric",
								minute: "2-digit",
							})}`
						: ""}
				</span>
				{hiddenEventsCount > 0 ? (
					<SendouButton
						icon={hiddenShown ? <EyeIcon /> : <EyeSlashIcon />}
						onClick={onToggleHidden}
						variant="minimal"
						className={styles.hiddenEventsButton}
					>
						{hiddenEventsCount}
					</SendouButton>
				) : null}
			</div>
			<div className={styles.clockHeaderDivider} />
		</div>
	);
}
