import clsx from "clsx";
import {
	Button,
	DateInput,
	type DatePickerProps,
	DateSegment,
	type DateValue,
	Dialog,
	Group,
	Popover,
	DatePicker as ReactAriaDatePicker,
} from "react-aria-components";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouCalendar } from "~/components/elements/Calendar";
import {
	type FormFieldSize,
	formFieldSizeToClassName,
} from "../form/form-utils";
import { CalendarIcon } from "../icons/Calendar";
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
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<Popover>
				<Dialog>
					<SendouCalendar />
				</Dialog>
			</Popover>
		</ReactAriaDatePicker>
	);
}
