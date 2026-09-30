import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { scheduleWeekSearchParams } from "../availability-search-params";
import type { ScheduleWeekView } from "../availability-types";
import { ScheduleDayCell } from "./ScheduleDayCell";
import styles from "./ScheduleWeekDialog.module.css";
import { WeekToggle } from "./WeekToggle";

/** One person's reportable weeks as a read-only day-by-day list of their free time. */
export function ScheduleWeekDialog({
	username,
	weeks,
	onClose,
}: {
	username: string;
	weeks: Array<ScheduleWeekView>;
	onClose: () => void;
}) {
	const { t } = useTranslation(["schedule"]);
	const [{ week }, setParams] = useSearchParamsTyped(scheduleWeekSearchParams);
	const { formatter: headingFormatter } = useDateTimeFormat({
		month: "short",
		day: "numeric",
	});

	const shownWeek =
		weeks.find((candidate) => candidate.week === week) ?? weeks[0];

	return (
		<SendouDialog
			heading={t("schedule:friends.availabilityOf", { name: username })}
			onClose={onClose}
			isDismissable
		>
			<div className="stack md">
				<div className={styles.header}>
					<span className={styles.weekLabel}>
						{t("schedule:team.weekHeading", { week: shownWeek.weekNumber })} ·{" "}
						{headingFormatter.formatRange(
							shownWeek.days[0].noonAt,
							shownWeek.days[6].noonAt,
						)}
					</span>
					<WeekToggle
						name="friend-schedule-week"
						value={week}
						onChange={(value) => setParams({ week: value })}
					/>
				</div>
				{shownWeek.reported ? (
					<WeekDays week={shownWeek} />
				) : (
					<div className="text-lighter text-sm" data-testid="schedule-no-week">
						{t("schedule:team.noSchedule")}
					</div>
				)}
			</div>
		</SendouDialog>
	);
}

function WeekDays({ week }: { week: ScheduleWeekView }) {
	const { formatter: dayFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
	});

	return (
		<ul className={styles.days} data-testid="schedule-week-days">
			{week.days.map((day) => (
				<li key={day.noonAt} className={styles.day}>
					<span className={styles.dayLabel}>
						{dayFormatter.format(day.noonAt)}
					</span>
					<ScheduleDayCell reported ranges={day.ranges} />
				</li>
			))}
		</ul>
	);
}
