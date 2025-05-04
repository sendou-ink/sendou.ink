import { useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { SendouButton } from "~/components/elements/Button";
import { EyeIcon } from "~/components/icons/Eye";
import { EyeSlashIcon } from "~/components/icons/EyeSlash";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE, navIconUrl } from "~/utils/urls";
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

	return (
		<Main bigger>
			<div className={styles.columnsContainer}>
				{daysShown().map((day) => (
					<DayEventsColumn
						key={`${day.month}-${day.date}`}
						date={day.date}
						month={day.month}
						events={data.events.filter((event) => {
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

function daysShown() {
	const result: Array<{
		date: number;
		month: number;
	}> = [];

	const now = new Date();

	for (let i = 0; i < 5; i++) {
		result.push({
			date: now.getDate(),
			month: now.getMonth(),
		});

		now.setDate(now.getDate() + 1);
	}

	return result;
}

function DayEventsColumn(props: {
	date: number;
	month: number;
	events: CalendarLoaderData["events"];
}) {
	const date = new Date(new Date().getFullYear(), props.month, props.date);

	return (
		<div>
			<DayHeader date={date} />
			<div className={styles.dayEvents}>
				{props.events.map((event, i) => (
					<div key={event.at} className="stack md">
						<ClockHeader
							date={databaseTimestampToDate(event.at)}
							hiddenEventsCount={2}
							hiddenShown={false}
							className={i !== 0 ? "mt-4" : undefined}
						/>
						{event.events.map((event) => (
							<TournamentCard key={event.id} tournament={event} />
						))}
					</div>
				))}
			</div>
		</div>
	);
}

function DayHeader(props: { date: Date }) {
	const { i18n } = useTranslation();
	const date = props.date;

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
	onToggleHidden?: () => void;
	hiddenShown: boolean;
	className?: string;
}) {
	const { i18n } = useTranslation();

	return (
		<div className={clsx(className, styles.clockHeader)}>
			<div className="stack horizontal justify-between">
				{date.toLocaleTimeString(i18n.language, {
					hour: "2-digit",
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
