import { getLocalTimeZone, today } from "@internationalized/date";
import {
	Button,
	Calendar,
	CalendarCell,
	CalendarGrid,
	DateInput,
	DateSegment,
	type DateValue,
	Dialog,
	Group,
	Heading,
	Popover,
	DatePicker as ReactAriaDatePicker,
	Label as ReactAriaLabel,
} from "react-aria-components";
import { ArrowLeftIcon } from "./icons/ArrowLeft";
import { ArrowRightIcon } from "./icons/ArrowRight";
import { CalendarIcon } from "./icons/Calendar";

// xxx: clicking in the center should focus something
export function DatePicker({
	label,
	required = false,
	onChange,
}: {
	label: string;
	required: boolean;
	onChange?: (date: Date | null) => void;
}) {
	const handleDateChange = (newDate: DateValue | null) => {
		onChange!(
			newDate
				? new Date(Date.UTC(newDate.year, newDate.month, newDate.day))
				: null,
		);
	};

	return (
		<ReactAriaDatePicker
			onChange={onChange ? handleDateChange : undefined}
			maxValue={today(getLocalTimeZone())}
		>
			<Label required={required}>{label}</Label>
			<Group>
				<DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>
				<Button>
					<CalendarIcon />
				</Button>
			</Group>
			<Popover>
				<Dialog>
					<Calendar>
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
								return <CalendarCell date={date} />;
							}}
						</CalendarGrid>
					</Calendar>
				</Dialog>
			</Popover>
		</ReactAriaDatePicker>
	);
}

// xxx: TODO: move to its own file
function Label({
	children,
	required,
}: {
	children: React.ReactNode;
	required?: boolean;
}) {
	return (
		<ReactAriaLabel>
			{children} {required && <span className="text-error">*</span>}
		</ReactAriaLabel>
	);
}
