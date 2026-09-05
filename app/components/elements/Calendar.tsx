import clsx from "clsx";
import {
	addDays,
	addMonths,
	addYears,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	isSameDay,
	isSameMonth,
	isToday,
	startOfDay,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import * as R from "remeda";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import styles from "./Calendar.module.css";

const DAYS_IN_WEEK = 7;

export interface SendouCalendarProps {
	value: Date | null;
	onChange: (date: Date) => void;
	className?: string;
	/** Selecting a day selects (and highlights) its whole week. */
	weekSelection?: boolean;
	firstDayOfWeek?: "sun" | "mon";
}

/**
 * Month grid for picking a day. Arrow keys move a day or a week at a time,
 * Home/End jump to the ends of the week and PageUp/PageDown flip months
 * (years with Shift), following focus across month boundaries.
 */
export function SendouCalendar({
	value,
	onChange,
	className,
	weekSelection,
	firstDayOfWeek = "sun",
}: SendouCalendarProps) {
	const { formatter: headingFormatter } = useDateTimeFormat({
		month: "long",
		year: "numeric",
	});
	const { formatter: weekdayFormatter } = useDateTimeFormat({
		weekday: "narrow",
	});
	const { formatter: dayFormatter } = useDateTimeFormat({
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const headingId = React.useId();

	const weekStartsOn = firstDayOfWeek === "mon" ? 1 : 0;
	const [viewMonth, setViewMonth] = React.useState(() =>
		startOfMonth(value ?? new Date()),
	);
	const [focusedDate, setFocusedDate] = React.useState(
		() => value ?? startOfDay(new Date()),
	);
	const pendingFocusRef = React.useRef(false);

	const moveMonth = (offset: number) =>
		setViewMonth(addMonths(viewMonth, offset));

	const moveFocusTo = (date: Date) => {
		setFocusedDate(date);
		if (!isSameMonth(date, viewMonth)) {
			setViewMonth(startOfMonth(date));
		}
		pendingFocusRef.current = true;
	};

	const onDayKeyDown = (event: React.KeyboardEvent, date: Date) => {
		const target = keyboardTarget(event, date, weekStartsOn);
		if (!target) return;
		event.preventDefault();
		moveFocusTo(target);
	};

	// the one day reachable with Tab: the focused day in this month, else the selection, else the first
	const tabStop = isSameMonth(focusedDate, viewMonth)
		? focusedDate
		: value && isSameMonth(value, viewMonth)
			? value
			: viewMonth;

	const focusWhenPending = (element: HTMLButtonElement | null) => {
		if (element && pendingFocusRef.current) {
			pendingFocusRef.current = false;
			element.focus();
		}
	};

	const weekdayNames = Array.from({ length: DAYS_IN_WEEK }, (_, i) =>
		weekdayFormatter.format(
			addDays(startOfWeek(viewMonth, { weekStartsOn }), i),
		),
	);
	const weeks = calendarWeeks(viewMonth, weekStartsOn);

	return (
		<div
			className={clsx(className, styles.root, {
				[styles.weekSelection]: weekSelection,
			})}
		>
			<header className={styles.header}>
				<button
					type="button"
					className={styles.navButton}
					aria-label="Previous month"
					onClick={() => moveMonth(-1)}
				>
					<ChevronLeft className={styles.navIcon} />
				</button>
				<h2 id={headingId} className={styles.heading}>
					{headingFormatter.format(viewMonth)}
				</h2>
				<button
					type="button"
					className={styles.navButton}
					aria-label="Next month"
					onClick={() => moveMonth(1)}
				>
					<ChevronRight className={styles.navIcon} />
				</button>
			</header>
			{/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a date grid per the ARIA date picker pattern */}
			<table className={styles.grid} role="grid" aria-labelledby={headingId}>
				<thead>
					<tr>
						{weekdayNames.map((weekday, index) => (
							<th key={index} className={styles.headerCell}>
								{weekday}
							</th>
						))}
					</tr>
				</thead>
				{/* biome-ignore-start lint/a11y/noNoninteractiveElementToInteractiveRole: gridcells of the date grid */}
				<tbody>
					{weeks.map((week, weekIndex) => (
						<tr key={weekIndex}>
							{week.map((day, dayIndex) => {
								const selected =
									value !== null && day !== null && isSameDay(day, value);
								const isTabStop = day !== null && isSameDay(day, tabStop);

								return (
									// biome-ignore lint/a11y/useFocusableInteractive: the cell carries the selection, its button the focus
									<td
										key={dayIndex}
										role="gridcell"
										aria-selected={day !== null ? selected : undefined}
									>
										{day !== null ? (
											<button
												type="button"
												ref={isTabStop ? focusWhenPending : undefined}
												tabIndex={isTabStop ? 0 : -1}
												className={styles.cell}
												aria-label={dayFormatter.format(day)}
												aria-current={isToday(day) ? "date" : undefined}
												data-testid="choose-date-button"
												data-selected={selected || undefined}
												onClick={() => onChange(day)}
												onKeyDown={(event) => onDayKeyDown(event, day)}
											>
												{day.getDate()}
											</button>
										) : null}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
				{/* biome-ignore-end lint/a11y/noNoninteractiveElementToInteractiveRole: gridcells of the date grid */}
			</table>
		</div>
	);
}

function keyboardTarget(
	event: React.KeyboardEvent,
	date: Date,
	weekStartsOn: 0 | 1,
) {
	switch (event.key) {
		case "ArrowLeft":
			return addDays(date, -1);
		case "ArrowRight":
			return addDays(date, 1);
		case "ArrowUp":
			return addDays(date, -DAYS_IN_WEEK);
		case "ArrowDown":
			return addDays(date, DAYS_IN_WEEK);
		case "Home":
			return startOfWeek(date, { weekStartsOn });
		case "End":
			return startOfDay(endOfWeek(date, { weekStartsOn }));
		case "PageUp":
			return event.shiftKey ? addYears(date, -1) : addMonths(date, -1);
		case "PageDown":
			return event.shiftKey ? addYears(date, 1) : addMonths(date, 1);
		default:
			return null;
	}
}

/** The month's weeks as rows of seven, days of neighbouring months left as null. */
function calendarWeeks(monthStart: Date, weekStartsOn: 0 | 1) {
	const days = eachDayOfInterval({
		start: startOfWeek(monthStart, { weekStartsOn }),
		end: endOfWeek(endOfMonth(monthStart), { weekStartsOn }),
	});

	return R.chunk(days, DAYS_IN_WEEK).map((week) =>
		week.map((day) => (isSameMonth(day, monthStart) ? day : null)),
	);
}
