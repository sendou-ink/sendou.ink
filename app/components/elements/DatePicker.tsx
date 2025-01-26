import clsx from "clsx";
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
} from "react-aria-components";
import { FormMessage } from "../FormMessage";
import {
	type FormFieldSize,
	formFieldSizeToClassName,
} from "../form/form-utils";
import { ArrowLeftIcon } from "../icons/ArrowLeft";
import { ArrowRightIcon } from "../icons/ArrowRight";
import { CalendarIcon } from "../icons/Calendar";
import { Label } from "./Label";

interface MyDatePickerProps<T extends DateValue> extends DatePickerProps<T> {
	label: string;
	bottomText?: string;
	errorText?: string;
	size?: FormFieldSize;
	testId?: string;
}

export function DatePicker<T extends DateValue>({
	label,
	errorText,
	bottomText,
	size,
	isRequired,
	testId,
	...rest
}: MyDatePickerProps<T>) {
	return (
		<ReactAriaDatePicker {...rest} validationBehavior="aria">
			<Label required={isRequired}>{label}</Label>
			<Group
				className={clsx("react-aria-Group", formFieldSizeToClassName(size))}
			>
				<DateInput data-testid={testId}>
					{(segment) => <DateSegment segment={segment} />}
				</DateInput>
				<Button data-testid="open-calendar-button">
					<CalendarIcon />
				</Button>
			</Group>
			{errorText && <FormMessage type="error">{errorText}</FormMessage>}
			{bottomText && !errorText ? (
				<FormMessage type="info">{bottomText}</FormMessage>
			) : null}
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
								return (
									<CalendarCell date={date} data-testid="choose-date-button" />
								);
							}}
						</CalendarGrid>
					</Calendar>
				</Dialog>
			</Popover>
		</ReactAriaDatePicker>
	);
}
