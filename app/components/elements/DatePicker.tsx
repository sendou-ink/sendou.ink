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
import {
	type FormFieldSize,
	formFieldSizeToClassName,
} from "../form/form-utils";
import { ArrowLeftIcon } from "../icons/ArrowLeft";
import { ArrowRightIcon } from "../icons/ArrowRight";
import { CalendarIcon } from "../icons/Calendar";
import { SendouFieldError } from "./FieldError";
import { SendouFieldMessage } from "./FieldMessage";
import { SendouLabel } from "./Label";

interface SendouDatePickerProps<T extends DateValue>
	extends DatePickerProps<T> {
	label: string;
	bottomText?: string;
	errorText?: string;
	size?: FormFieldSize;
}

export function SendouDatePicker<T extends DateValue>({
	label,
	errorText,
	bottomText,
	size,
	isRequired,
	...rest
}: SendouDatePickerProps<T>) {
	return (
		<ReactAriaDatePicker {...rest} validationBehavior="aria">
			<SendouLabel required={isRequired}>{label}</SendouLabel>
			<Group
				className={clsx("react-aria-Group", formFieldSizeToClassName(size))}
			>
				<DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>
				<Button data-testid="open-calendar-button">
					<CalendarIcon />
				</Button>
			</Group>
			{errorText && <SendouFieldError>{errorText}</SendouFieldError>}
			{bottomText && !errorText ? (
				<SendouFieldMessage>{bottomText}</SendouFieldMessage>
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
