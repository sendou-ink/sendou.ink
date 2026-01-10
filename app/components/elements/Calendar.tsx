import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
	Button,
	Calendar,
	CalendarCell,
	CalendarGrid,
	CalendarGridBody,
	CalendarGridHeader,
	CalendarHeaderCell,
	type CalendarProps,
	type DateValue,
	Heading,
} from "react-aria-components";
import styles from "./Calendar.module.css";

export interface SendouCalendarProps<T extends DateValue>
	extends CalendarProps<T> {
	className?: string;
}

export function SendouCalendar<T extends DateValue>({
	className,
	...rest
}: SendouCalendarProps<T>) {
	return (
		<Calendar className={clsx(className, styles.root)} {...rest}>
			<header className={styles.header}>
				<Button slot="previous" className={styles.navButton}>
					<ChevronLeft className={styles.navIcon} />
				</Button>
				<Heading className={styles.heading} />
				<Button slot="next" className={styles.navButton}>
					<ChevronRight className={styles.navIcon} />
				</Button>
			</header>
			<CalendarGrid className={styles.grid}>
				<CalendarGridHeader>
					{(day) => (
						<CalendarHeaderCell className={styles.headerCell}>
							{day}
						</CalendarHeaderCell>
					)}
				</CalendarGridHeader>
				<CalendarGridBody>
					{(date) => (
						<CalendarCell
							date={date}
							className={styles.cell}
							data-testid="choose-date-button"
						/>
					)}
				</CalendarGridBody>
			</CalendarGrid>
		</Calendar>
	);
}
