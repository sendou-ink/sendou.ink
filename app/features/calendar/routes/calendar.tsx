import clsx from "clsx";
import { isToday } from "date-fns";
import {
	Calendar,
	ChevronLeft,
	ChevronRight,
	Eye,
	EyeOff,
	Link as LinkIcon,
} from "lucide-react";
import type * as React from "react";
import type { DateValue } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { CopyToClipboardPopover } from "~/components/CopyToClipboardPopover";
import {
	SendouButton,
	type SendouButtonProps,
} from "~/components/elements/Button";
import { SendouCalendar } from "~/components/elements/Calendar";
import { SendouPopover } from "~/components/elements/Popover";
import { LocaleTime } from "~/components/LocaleTime";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { Main } from "~/components/Main";
import { DAYS_SHOWN_AT_A_TIME } from "~/features/calendar/calendar-constants";
import { useCollapsableEvents } from "~/features/calendar/calendar-hooks";
import { calendarSearchParams } from "~/features/calendar/calendar-search-params";
import { dragToScroll } from "~/hooks/useDragToScroll";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { dayMonthYearToDateValue } from "~/utils/dates";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { DayMonthYear } from "~/utils/schema";
import { CALENDAR_PAGE, navIconUrl } from "~/utils/urls";
import { action } from "../actions/calendar";
import { daysForCalendar } from "../calendar-utils";
import { FiltersBar } from "../components/FiltersBar";
import { TournamentCard } from "../components/TournamentCard";
import { type CalendarLoaderData, loader } from "../loaders/calendar.server";

export { action, loader };

import { calendarIcalFeed } from "~/features/calendar/calendar-urls";
import styles from "./calendar.module.css";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Calendar",
		ogTitle: "Splatoon competitive event calendar",
		image: ogPageImage("calendar"),
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
	const { t } = useTranslation(["calendar", "common"]);
	const data = useLoaderData<typeof loader>();

	const { previous, shown, next, current } = daysForCalendar(data.dateViewed);

	return (
		<Main
			breakoutContainer
			className={clsx("stack lg", styles.container)}
			style={{ "--columns-count": DAYS_SHOWN_AT_A_TIME } as React.CSSProperties}
		>
			<div
				className={clsx(styles.columnsWidthContainer, styles.buttonsContainer)}
			>
				<div className={styles.navigateButtonsContainer}>
					<NavigateButton icon={<ChevronLeft />} daysInterval={previous}>
						{t("common:actions.previous")}
					</NavigateButton>
					<NavigateButton icon={<ChevronRight />} daysInterval={next}>
						{t("common:actions.next")}
					</NavigateButton>
					<CalendarDatePicker
						dayMonthYear={current}
						key={JSON.stringify(current)}
					/>
				</div>
				<div className="stack sm horizontal ml-auto">
					<CopyToClipboardPopover
						trigger={
							<SendouButton icon={<LinkIcon />} size="small" variant="outlined">
								{t("calendar:icalFeed")}
							</SendouButton>
						}
						url={calendarIcalFeed(data.filters)}
					/>
				</div>
			</div>
			<div className={styles.columnsWidthContainer}>
				<FiltersBar />
			</div>
			<div
				key={`${shown[0].year}-${shown[0].month}-${shown[0].day}`}
				ref={setUpColumnsContainer}
				className={clsx(styles.columnsContainer, "scrollbar")}
			>
				{shown.map((date) => (
					<DayEventsColumn
						key={`${date.month}-${date.day}`}
						date={date.day}
						month={date.month}
						year={date.year}
						isToday={isToday(new Date(date.year, date.month, date.day))}
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
	const dayHref = useCalendarDayHref();

	const lowestDate = daysInterval[0];
	const highestDate = daysInterval[daysInterval.length - 1];

	const year = new Date().getFullYear();

	return (
		<Link
			to={dayHref(lowestDate)}
			className={clsx(styles.navigateButton, styles.navigateArrowButton)}
			data-testid="calendar-navigate-button"
		>
			{icon}
			<div>
				<div>{children}</div>
				<LocaleTimeRange
					from={new Date(year, lowestDate.month, lowestDate.day)}
					to={new Date(year, highestDate.month, highestDate.day)}
					options={{ day: "numeric", month: "numeric" }}
					className={styles.navigateArrowButtonRange}
				/>
			</div>
		</Link>
	);
}

function CalendarDatePicker({ dayMonthYear }: { dayMonthYear: DayMonthYear }) {
	const navigate = useNavigate();
	const dayHref = useCalendarDayHref();

	const onChange = (date: DateValue) => {
		navigate(
			dayHref({
				day: date.day,
				month: date.month - 1,
				year: date.year,
			}),
		);
	};

	return (
		<SendouPopover
			trigger={
				<SendouButton className={styles.navigateButton} icon={<Calendar />} />
			}
		>
			<SendouCalendar
				className={styles.calendar}
				value={dayMonthYearToDateValue(dayMonthYear)}
				onChange={onChange}
				firstDayOfWeek="mon"
				weekSelection
			/>
		</SendouPopover>
	);
}

/** Href to another day, carrying the current filter search params over unchanged. */
function useCalendarDayHref() {
	const [params] = useSearchParamsTyped(calendarSearchParams);

	return (dayMonthYear: DayMonthYear) =>
		calendarSearchParams.href(CALENDAR_PAGE, { ...params, ...dayMonthYear });
}

function setUpColumnsContainer(container: HTMLDivElement | null) {
	scrollTodayToCenter(container);
	if (!container) return;

	return dragToScroll(container);
}

/** Centers today's column, leaving weeks that don't contain today scrolled to their first day. */
function scrollTodayToCenter(container: HTMLDivElement | null) {
	if (!container) return;

	const todayColumn = container.querySelector<HTMLElement>(
		"[data-today-column]",
	);
	if (!todayColumn) return;

	const containerRect = container.getBoundingClientRect();
	const columnRect = todayColumn.getBoundingClientRect();

	container.scrollLeft +=
		columnRect.left -
		containerRect.left -
		(containerRect.width - columnRect.width) / 2;
}

function DayEventsColumn({
	date,
	month,
	year,
	isToday,
	eventTimes,
}: {
	date: number;
	month: number;
	year: number;
	isToday: boolean;
	eventTimes: CalendarLoaderData["eventTimes"];
}) {
	const eventTimesCollapsed = useCollapsableEvents(eventTimes);

	return (
		<div data-today-column={isToday || undefined}>
			<DayHeader date={date} month={month} year={year} isToday={isToday} />
			<div className={styles.dayEvents}>
				{eventTimesCollapsed.map((eventTime, i) => {
					return (
						<div key={eventTime.date.from.getTime()} className="stack md">
							<ClockHeader
								date={eventTime.date.from}
								toDate={eventTime.date.to}
								hiddenEventsCount={eventTime.hiddenCount}
								hiddenShown={eventTime.hiddenShown}
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

function DayHeader(props: {
	date: number;
	month: number;
	year: number;
	isToday: boolean;
}) {
	const date = new Date(props.year, props.month, props.date);

	return (
		<div
			className={clsx(styles.dayHeader, {
				[styles.dayHeaderToday]: props.isToday,
			})}
			data-testid={props.isToday ? "today-header" : undefined}
		>
			<LocaleTime
				date={date}
				options={{
					day: "numeric",
					month: "long",
				}}
			/>
			<div className={styles.dayHeaderWeekday}>
				<LocaleTime
					date={date}
					options={{
						weekday: "long",
					}}
				/>
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
	const isInThePast = (toDate ?? date).getTime() < Date.now();
	const timeOptions: Intl.DateTimeFormatOptions = {
		hour: "numeric",
		minute: "numeric",
	};

	return (
		<div className={clsx(className, styles.clockHeader)}>
			<div className="stack horizontal justify-between">
				{toDate ? (
					<LocaleTimeRange
						from={date}
						to={toDate}
						options={timeOptions}
						className={clsx({
							"text-lighter italic": isInThePast,
						})}
						data-testid="clock-header-time"
					/>
				) : (
					<LocaleTime
						className={clsx({
							"text-lighter italic": isInThePast,
						})}
						date={date}
						options={timeOptions}
						data-testid="clock-header-time"
					/>
				)}
				{hiddenEventsCount > 0 ? (
					<SendouButton
						icon={hiddenShown ? <Eye /> : <EyeOff />}
						onPress={onToggleHidden}
						variant="minimal"
						className={styles.hiddenEventsButton}
						data-testid="hidden-events-button"
					>
						{hiddenEventsCount}
					</SendouButton>
				) : null}
			</div>
			<div className={styles.clockHeaderDivider} />
		</div>
	);
}
