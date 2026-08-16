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
	/** Highlights the whole week row rather than a single day, for pickers where choosing a day means choosing the week it belongs to. */
	weekSelection?: boolean;
}

export function SendouCalendar<T extends DateValue>({
	className,
	weekSelection,
	...rest
}: SendouCalendarProps<T>) {
	return (
		<Calendar
			className={clsx(className, styles.root, {
				[styles.weekSelection]: weekSelection,
			})}
			{...rest}
		>
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
