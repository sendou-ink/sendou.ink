import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import styles from "./Calendar.module.css";

export interface SendouCalendarProps {
	value: Date | null;
	onChange: (date: Date) => void;
	className?: string;
	/** Highlights the whole week row rather than a single day, for pickers where choosing a day means choosing the week it belongs to. */
	weekSelection?: boolean;
	firstDayOfWeek?: "sun" | "mon";
}

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

	const anchor = value ?? new Date();
	const [viewYear, setViewYear] = React.useState(anchor.getFullYear());
	const [viewMonth, setViewMonth] = React.useState(anchor.getMonth());

	const moveMonth = (offset: number) => {
		const next = new Date(viewYear, viewMonth + offset, 1);
		setViewYear(next.getFullYear());
		setViewMonth(next.getMonth());
	};

	const heading = headingFormatter.format(new Date(viewYear, viewMonth, 1));
	// 2023-01-01 was a Sunday
	const firstWeekdayOffset = firstDayOfWeek === "mon" ? 2 : 1;
	const weekdayNames = Array.from({ length: 7 }, (_, i) =>
		weekdayFormatter.format(new Date(2023, 0, firstWeekdayOffset + i)),
	);

	const weeks = calendarWeeks(viewYear, viewMonth, firstDayOfWeek);

	const isSelectedDay = (day: number) =>
		value !== null &&
		value.getFullYear() === viewYear &&
		value.getMonth() === viewMonth &&
		value.getDate() === day;

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
				<h2 className={styles.heading}>{heading}</h2>
				<button
					type="button"
					className={styles.navButton}
					aria-label="Next month"
					onClick={() => moveMonth(1)}
				>
					<ChevronRight className={styles.navIcon} />
				</button>
			</header>
			<table className={styles.grid}>
				<thead>
					<tr>
						{weekdayNames.map((weekday, index) => (
							<th key={index} className={styles.headerCell}>
								{weekday}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{weeks.map((week, weekIndex) => (
						<tr key={weekIndex}>
							{week.map((day, dayIndex) => (
								<td key={dayIndex}>
									{day !== null ? (
										<button
											type="button"
											className={styles.cell}
											data-testid="choose-date-button"
											data-selected={isSelectedDay(day) || undefined}
											onClick={() =>
												onChange(new Date(viewYear, viewMonth, day))
											}
										>
											{day}
										</button>
									) : null}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function calendarWeeks(
	year: number,
	month: number,
	firstDayOfWeek: "sun" | "mon",
) {
	const firstOfMonth = new Date(year, month, 1);
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const leadingEmpty =
		firstDayOfWeek === "mon"
			? (firstOfMonth.getDay() + 6) % 7
			: firstOfMonth.getDay();

	const weeks: Array<Array<number | null>> = [];
	let week: Array<number | null> = new Array(leadingEmpty).fill(null);

	for (let day = 1; day <= daysInMonth; day++) {
		week.push(day);
		if (week.length === 7) {
			weeks.push(week);
			week = [];
		}
	}
	if (week.length > 0) {
		while (week.length < 7) week.push(null);
		weeks.push(week);
	}

	return weeks;
}
