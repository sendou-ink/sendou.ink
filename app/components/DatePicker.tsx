import {
	Button,
	Calendar,
	CalendarCell,
	CalendarGrid,
	DateInput,
	type DatePickerProps,
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

interface MyDatePickerProps<T extends DateValue> extends DatePickerProps<T> {
	label: string;
}

// xxx: clicking in the center should focus something
export function DatePicker<T extends DateValue>({
	label,
	...rest
}: MyDatePickerProps<T>) {
	return (
		<ReactAriaDatePicker {...rest}>
			<Label required={rest.isRequired}>{label}</Label>
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
