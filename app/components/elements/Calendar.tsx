import clsx from "clsx";
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
import { ArrowLeftIcon } from "~/components/icons/ArrowLeft";
import { ArrowRightIcon } from "~/components/icons/ArrowRight";
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
					<ArrowLeftIcon className={styles.navIcon} />
				</Button>
				<Heading className={styles.heading} />
				<Button slot="next" className={styles.navButton}>
					<ArrowRightIcon className={styles.navIcon} />
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
