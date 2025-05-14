import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
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
import { FilterIcon } from "~/components/icons/Filter";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE, navIconUrl } from "~/utils/urls";
import { calendarEventSorter, daysForCalendar } from "../calendar-utils";
import { TournamentCard } from "../components/TournamentCard";

import { type CalendarLoaderData, loader } from "../loaders/calendar.server";
export { loader };

import styles from "./calendar.module.css";

// xxx: restore
// export const meta: MetaFunction = (args) => {
// 	const data = args.data as SerializeFrom<typeof loader> | null;

// 	if (!data) return [];

// 	const events = data.events.slice().sort((a, b) => {
// 		const aParticipants = a.participantCounts?.teams ?? 0;
// 		const bParticipants = b.participantCounts?.teams ?? 0;

// 		if (aParticipants > bParticipants) return -1;
// 		if (aParticipants < bParticipants) return 1;

// 		return 0;
// 	});

// 	return metaTags({
// 		title: "Calendar",
// 		ogTitle: "Splatoon competitive event calendar",
// 		location: args.location,
// 		description: `${data.events.length} events on sendou.ink happening during week ${
// 			data.displayedWeek
// 		} including ${joinListToNaturalString(
// 			events.slice(0, 3).map((e) => e.name),
// 		)}`,
// 	});
// };

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

	const { previous, shown, next } = daysForCalendar();

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
				<SendouButton variant="outlined" size="small" icon={<FilterIcon />}>
					Filter
				</SendouButton>
			</div>
			<div className={styles.columnsContainer}>
				{shown.map((day) => (
					<DayEventsColumn
						key={`${day.month}-${day.date}`}
						date={day.date}
						month={day.month}
						eventTimes={data.eventTimes.filter((event) => {
							const eventDate = new Date(event.at);

							return (
								eventDate.getDate() === day.date &&
								eventDate.getMonth() === day.month
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
		new Date(new Date().getFullYear(), day.month, day.date).toLocaleDateString(
			i18n.language,
			{
				day: "numeric",
				month: "short",
			},
		);

	return (
		<SendouButton
			icon={icon}
			variant="minimal"
			className={styles.navigateButton}
		>
			<div>
				<div>{children}</div>
				<div className="text-xxs text-lighter">
					{dateToString(lowestDate)} - {dateToString(highestDate)}
				</div>
			</div>
		</SendouButton>
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
	const [hiddenShown, setHiddenShown] = React.useState(false);

	return (
		<div>
			<DayHeader date={date} month={month} />
			<div className={styles.dayEvents}>
				{eventTimes.map((eventTime, i) => {
					const eventsShown = hiddenShown
						? [...eventTime.events.shown, ...eventTime.events.hidden].sort(
								calendarEventSorter,
							)
						: eventTime.events.shown;

					return (
						<div key={eventTime.at} className="stack md">
							<ClockHeader
								date={new Date(eventTime.at)}
								hiddenEventsCount={eventTime.events.hidden.length}
								hiddenShown={hiddenShown}
								onToggleHidden={() => setHiddenShown((prev) => !prev)}
								className={i !== 0 ? "mt-4" : undefined}
							/>
							{eventsShown.map((event) => (
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

// xxx: if many in row have none visible, collapse
function ClockHeader({
	date,
	hiddenEventsCount = 0,
	onToggleHidden,
	hiddenShown,
	className,
}: {
	date: Date;
	hiddenEventsCount?: number;
	onToggleHidden: () => void;
	hiddenShown: boolean;
	className?: string;
}) {
	const { i18n } = useTranslation();

	return (
		<div className={clsx(className, styles.clockHeader)}>
			<div className="stack horizontal justify-between">
				{date.toLocaleTimeString(i18n.language, {
					hour: "numeric",
					minute: "2-digit",
				})}
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
