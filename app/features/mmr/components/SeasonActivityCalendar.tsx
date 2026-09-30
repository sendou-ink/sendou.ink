import clsx from "clsx";
import { eachDayOfInterval, format, startOfDay, startOfWeek } from "date-fns";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import styles from "./SeasonActivityCalendar.module.css";

const CALENDAR_WEEK_LENGTH = 7;
/** Thursday, the day that decides which month a week column belongs to */
const CALENDAR_WEEK_MONTH_DAY_INDEX = 3;
/** Monday and Friday, the only rows the calendar names */
const CALENDAR_NAMED_WEEKDAY_INDICES = [0, 4];

export type SeasonActivity = "sq" | "tournament" | "both";

/**
 * Calendar of a season's days, one column per week, colored by what the user played that day.
 * Days after `today` are marked as upcoming. Cell size follows the `--calendar-cell-size` variable (18px by default),
 * and `--calendar-weeks` is set to the number of week columns for sizing cells to the available width.
 */
export function SeasonActivityCalendar({
	seasonDateRange,
	activeDays,
	today,
	monthNames = "long",
	className,
}: {
	seasonDateRange: { starts: Date; ends: Date };
	/** Days with at least one set played, dates in "yyyy-MM-dd" format */
	activeDays: Array<{ date: string; activity: SeasonActivity }>;
	today?: Date;
	monthNames?: "long" | "short";
	className?: string;
}) {
	const { formatter } = useDateTimeFormat({ month: monthNames });

	const activityByDay = new Map(
		activeDays.map((day) => [day.date, day.activity]),
	);
	const seasonFirstDay = startOfDay(seasonDateRange.starts);
	const weeks = seasonWeeks({
		seasonFirstDay,
		seasonLastDay: seasonDateRange.ends,
	});
	const months = calendarMonths(weeks);
	const isUpcoming = (day: Date) =>
		today ? day.getTime() > today.getTime() : false;

	return (
		<div
			className={clsx(styles.container, className)}
			style={{ "--calendar-weeks": weeks.length }}
		>
			<div className={styles.calendar}>
				<CalendarWeekdays firstWeek={weeks[0]} />
				<div className={styles.calendarMonths}>
					{months.map((month) => (
						<div key={month.key} className={styles.calendarMonth}>
							<div className={clsx(styles.label, styles.calendarMonthName)}>
								{formatter.format(month.month)}
							</div>
							<div className={styles.calendarWeeks}>
								{month.weeks.map((week) => (
									<div
										key={format(week[0], "yyyy-MM-dd")}
										className={styles.calendarWeek}
									>
										{week.map((day) => {
											const key = format(day, "yyyy-MM-dd");
											const beforeSeason =
												day.getTime() < seasonFirstDay.getTime();

											return (
												<div
													key={key}
													className={clsx(
														styles.calendarCell,
														activityClass(activityByDay.get(key)),
														{
															[styles.calendarCellHidden]: beforeSeason,
															[styles.calendarUpcoming]: isUpcoming(day),
														},
													)}
												/>
											);
										})}
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
			<ActivityLegend />
		</div>
	);
}

function CalendarWeekdays({ firstWeek }: { firstWeek: Date[] }) {
	const { formatter } = useDateTimeFormat({ weekday: "short" });

	return (
		<div className={clsx(styles.label, styles.calendarWeekdays)}>
			{firstWeek.map((day, dayIndex) => (
				<div key={format(day, "yyyy-MM-dd")} className={styles.calendarWeekday}>
					{CALENDAR_NAMED_WEEKDAY_INDICES.includes(dayIndex)
						? formatter.format(day)
						: null}
				</div>
			))}
		</div>
	);
}

/** Monday to Sunday week columns; an incomplete last week (a season ending mid-week) is left out. */
function seasonWeeks({
	seasonFirstDay,
	seasonLastDay,
}: {
	seasonFirstDay: Date;
	seasonLastDay: Date;
}): Date[][] {
	const weeks: Date[][] = R.chunk(
		eachDayOfInterval({
			start: startOfWeek(seasonFirstDay, { weekStartsOn: 1 }),
			end: seasonLastDay,
		}),
		CALENDAR_WEEK_LENGTH,
	);

	const lastWeek = weeks[weeks.length - 1];
	if (weeks.length > 1 && lastWeek.length < CALENDAR_WEEK_LENGTH) {
		weeks.pop();
	}

	return weeks;
}

/** Groups the week columns under the month that holds most of the week */
function calendarMonths(weeks: Date[][]) {
	const months: Array<{ key: string; month: Date; weeks: Date[][] }> = [];

	for (const week of weeks) {
		const monthDay =
			week[CALENDAR_WEEK_MONTH_DAY_INDEX] ?? week[week.length - 1];
		const key = format(monthDay, "yyyy-MM");
		const latestMonth = months[months.length - 1];

		if (latestMonth?.key === key) {
			latestMonth.weeks.push(week);
		} else {
			months.push({ key, month: monthDay, weeks: [week] });
		}
	}

	return months;
}

function ActivityLegend() {
	const { t } = useTranslation(["user"]);

	return (
		<div className={clsx(styles.label, styles.calendarLegend)}>
			<div className={styles.calendarLegendItem}>
				<div className={clsx(styles.calendarCell, styles.calendarSq)} />
				SendouQ
			</div>
			<div className={styles.calendarLegendItem}>
				<div className={clsx(styles.calendarCell, styles.calendarTournament)} />
				{t("user:seasons.summary.activity.tournament")}
			</div>
			<div className={styles.calendarLegendItem}>
				<div className={clsx(styles.calendarCell, styles.calendarBoth)} />
				{t("user:seasons.summary.activity.both")}
			</div>
		</div>
	);
}

function activityClass(activity?: SeasonActivity) {
	if (!activity) return undefined;

	switch (activity) {
		case "sq":
			return styles.calendarSq;
		case "tournament":
			return styles.calendarTournament;
		case "both":
			return styles.calendarBoth;
	}
}
