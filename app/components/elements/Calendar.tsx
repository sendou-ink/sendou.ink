import clsx from "clsx";
import {
	Button,
	Calendar,
	CalendarCell,
	CalendarGrid,
	type CalendarProps,
	type DateValue,
	Heading,
} from "react-aria-components";
import { ArrowLeftIcon } from "~/components/icons/ArrowLeft";
import { ArrowRightIcon } from "~/components/icons/ArrowRight";

export interface SendouCalendarProps<T extends DateValue>
	extends CalendarProps<T> {
	className?: string;
}

export function SendouCalendar<T extends DateValue>({
	className,
	...rest
}: SendouCalendarProps<T>) {
	return (
		<Calendar className={clsx(className, "react-aria-Calendar")} {...rest}>
			<header>
				<Button slot="previous">
					<ArrowLeftIcon />
				</Button>
				<Heading />
				<Button slot="next">
					<ArrowRightIcon />
				</Button>
			</header>
			<CalendarGrid>
				{(date) => {
					return <CalendarCell date={date} data-testid="choose-date-button" />;
				}}
			</CalendarGrid>
		</Calendar>
	);
}
