import type { MetaFunction } from "@remix-run/node";
import { Link, useLoaderData, useNavigate } from "@remix-run/react";
import clsx from "clsx";
import type * as React from "react";
import type { DateValue } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { AddNewButton } from "~/components/AddNewButton";
import { CopyToClipboardPopover } from "~/components/CopyToClipboardPopover";
import { Main } from "~/components/Main";
import {
	SendouButton,
	type SendouButtonProps,
} from "~/components/elements/Button";
import { SendouCalendar } from "~/components/elements/Calendar";
import { SendouPopover } from "~/components/elements/Popover";
import { ArrowLeftIcon } from "~/components/icons/ArrowLeft";
import { ArrowRightIcon } from "~/components/icons/ArrowRight";
import { CalendarIcon } from "~/components/icons/Calendar";
import { EyeIcon } from "~/components/icons/Eye";
import { EyeSlashIcon } from "~/components/icons/EyeSlash";
import { LinkIcon } from "~/components/icons/Link";
import { DAYS_SHOWN_AT_A_TIME } from "~/features/calendar/calendar-constants";
import { useCollapsableEvents } from "~/features/calendar/calendar-hooks";
import { dayMonthYearToDateValue } from "~/utils/dates";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	CALENDAR_NEW_PAGE,
	CALENDAR_PAGE,
	TOURNAMENT_NEW_PAGE,
	calendarIcalFeed,
	calendarPage,
	navIconUrl,
} from "~/utils/urls";
import type { DayMonthYear } from "~/utils/zod";
import { daysForCalendar } from "../calendar-utils";
import { FiltersDialog } from "../components/FiltersDialog";
import { TournamentCard } from "../components/TournamentCard";
import * as CalendarEvent from "../core/CalendarEvent";

import { action } from "../actions/calendar";
import { type CalendarLoaderData, loader } from "../loaders/calendar.server";
export { action, loader };

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
	const { t } = useTranslation(["calendar", "common"]);
	const data = useLoaderData<typeof loader>();

	const { previous, shown, next, current } = daysForCalendar(data.dateViewed);

	return (
		<Main bigger className="stack lg">
			<div className={styles.buttonsContainer}>
				<div className={styles.navigateButtonsContainer}>
					<NavigateButton
						icon={<ArrowLeftIcon />}
						daysInterval={previous}
						filters={data.filters}
					>
						{t("common:actions.previous")}
					</NavigateButton>
					<NavigateButton
						icon={<ArrowRightIcon />}
						daysInterval={next}
						filters={data.filters}
					>
						{t("common:actions.next")}
					</NavigateButton>
					<CalendarDatePicker
						dayMonthYear={current}
						filters={data.filters}
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
					<FiltersDialog
						key={CalendarEvent.filtersToString(data.filters)}
						filters={data.filters}
					/>
					<AddNewButton navIcon="calendar" to={CALENDAR_NEW_PAGE} />
					<AddNewButton navIcon="medal" to={TOURNAMENT_NEW_PAGE} />
				</div>
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
	filters,
}: {
	icon: SendouButtonProps["icon"];
	children: React.ReactNode;
	daysInterval: ReturnType<typeof daysForCalendar>["shown"];
	filters?: CalendarLoaderData["filters"];
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

	return (
		<Link
			to={calendarPage({ filters, dayMonthYear: lowestDate })}
			className={clsx(styles.navigateButton, styles.navigateArrowButton)}
			data-testid="calendar-navigate-button"
		>
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

function CalendarDatePicker({
	dayMonthYear,
	filters,
}: { dayMonthYear: DayMonthYear; filters?: CalendarLoaderData["filters"] }) {
	const navigate = useNavigate();

	const onChange = (date: DateValue) => {
		navigate(
			calendarPage({
				filters,
				dayMonthYear: {
					day: date.day,
					month: date.month - 1,
					year: date.year,
				},
			}),
		);
	};

	return (
		<SendouPopover
			trigger={
				<SendouButton
					className={styles.navigateButton}
					icon={<CalendarIcon />}
				/>
			}
		>
			<SendouCalendar
				className={styles.calendar}
				value={dayMonthYearToDateValue(dayMonthYear)}
				onChange={onChange}
			/>
		</SendouPopover>
	);
}

function DayEventsColumn({
	date,
	month,
	eventTimes,
}: {
	date: number;
	month: number;
	eventTimes: CalendarLoaderData["eventTimes"];
}) {
	const eventTimesCollapsed = useCollapsableEvents(eventTimes);

	return (
		<div>
			<DayHeader date={date} month={month} />
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

function DayHeader(props: { date: number; month: number }) {
	const { i18n } = useTranslation();

	const date = new Date(new Date().getFullYear(), props.month, props.date);
	const isToday = date.toDateString() === new Date().toDateString();

	return (
		<div
			className={clsx(styles.dayHeader, {
				[styles.dayHeaderToday]: isToday,
			})}
			data-testid={isToday ? "today-header" : undefined}
		>
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
