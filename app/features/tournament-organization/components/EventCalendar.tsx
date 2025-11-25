import type { SerializeFrom } from "@remix-run/node";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { LinkButton } from "~/components/elements/Button";
import type { MonthYear } from "~/features/plus-voting/core";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate, nullPaddedDatesOfMonth } from "~/utils/dates";
import type { loader } from "../loaders/org.$slug.server";

interface EventCalendarProps {
	month: number;
	year: number;
	events: SerializeFrom<typeof loader>["events"];
	fallbackLogoUrl: string;
}

export function EventCalendar({
	month,
	year,
	events,
	fallbackLogoUrl,
}: EventCalendarProps) {
	const dates = nullPaddedDatesOfMonth({ month, year });
	const isMounted = useIsMounted();
	const { i18n } = useTranslation();

	const dayHeaders = Array.from({ length: 7 }, (_, i) => {
		const date = new Date(2024, 0, 1 + i);
		return new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(
			date,
		);
	});

	return (
		<div className="org__calendar__container">
			<MonthSelector month={month} year={year} />
			<div className="org__calendar">
				{dayHeaders.map((day) => (
					<div key={day} className="org__calendar__day-header">
						{day}
					</div>
				))}
				{dates.map((date, i) => {
					const daysEvents = events.filter((event) => {
						const startTimeDate = databaseTimestampToDate(event.startTime);

						return (
							isMounted &&
							startTimeDate.getDate() === date?.getUTCDate() &&
							startTimeDate.getMonth() === date.getUTCMonth()
						);
					});

					return (
						<EventCalendarCell
							key={i}
							date={date}
							events={daysEvents}
							fallbackLogoUrl={fallbackLogoUrl}
						/>
					);
				})}
			</div>
		</div>
	);
}

function EventCalendarCell({
	date,
	events,
	fallbackLogoUrl,
}: {
	date: Date | null;
	events: SerializeFrom<typeof loader>["events"];
	fallbackLogoUrl: string;
}) {
	const isMounted = useIsMounted();

	return (
		<div
			className={clsx("org__calendar__day", {
				org__calendar__day__previous: !date,
				org__calendar__day__today:
					isMounted &&
					date?.getDate() === new Date().getDate() &&
					date?.getMonth() === new Date().getMonth() &&
					date?.getFullYear() === new Date().getFullYear(),
			})}
		>
			<div className="org__calendar__day__date">{date?.getUTCDate()}</div>
			{events.length === 1 ? (
				<img
					className="org__calendar__day__logo"
					src={events[0].logoUrl ?? fallbackLogoUrl}
					width={32}
					height={32}
					alt={events[0].name}
				/>
			) : null}
			{events.length > 1 ? (
				<div className="org__calendar__day__many-events">{events.length}</div>
			) : null}
		</div>
	);
}

const monthYearSearchParams = ({ month, year }: MonthYear) =>
	new URLSearchParams([
		["month", String(month)],
		["year", String(year)],
	]).toString();
function MonthSelector({ month, year }: { month: number; year: number }) {
	const date = new Date(Date.UTC(year, month, 15));
	const { formatDate } = useTimeFormat();

	return (
		<div className="org__calendar__month-selector">
			<LinkButton
				variant="minimal"
				aria-label="Previous month"
				to={`?${monthYearSearchParams(
					month === 0
						? { month: 11, year: year - 1 }
						: {
								month: date.getMonth() - 1,
								year: date.getFullYear(),
							},
				)}`}
			>
				{"<"}
			</LinkButton>
			<div>
				{formatDate(date, {
					year: "numeric",
					month: "long",
				})}
			</div>
			<LinkButton
				variant="minimal"
				aria-label="Following month"
				to={`?${monthYearSearchParams(
					month === 11
						? { month: 0, year: year + 1 }
						: {
								month: date.getMonth() + 1,
								year: date.getFullYear(),
							},
				)}`}
			>
				{">"}
			</LinkButton>
		</div>
	);
}
