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
import { useIsMounted } from "~/hooks/useIsMounted";
import { CalendarIcon } from "../icons/Calendar";
import { SendouLabel } from "./Label";

interface SendouDatePickerProps<T extends DateValue>
	extends DatePickerProps<T> {
	label: string;
	bottomText?: string;
	errorText?: string;
	errorId?: string;
}

export function SendouDatePicker<T extends DateValue>({
	label,
	errorText,
	errorId,
	bottomText,
	isRequired,
	...rest
}: SendouDatePickerProps<T>) {
	const isMounted = useIsMounted();

	if (!isMounted) {
		return (
			<div>
				<SendouLabel required={isRequired}>{label}</SendouLabel>
				<input type="text" disabled />
				<SendouBottomTexts
					bottomText={bottomText}
					errorText={errorText}
					errorId={errorId}
				/>
			</div>
		);
	}

	return (
		<ReactAriaDatePicker
			{...rest}
			validationBehavior="aria"
			aria-label={label}
			isInvalid={!!errorText}
		>
			<SendouLabel required={isRequired}>{label}</SendouLabel>
			<Group className="react-aria-Group">
				<DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>
				<Button data-testid="open-calendar-button">
					<CalendarIcon />
				</Button>
			</Group>
			<SendouBottomTexts
				bottomText={bottomText}
				errorText={errorText}
				errorId={errorId}
			/>
			<Popover>
				<Dialog>
					<SendouCalendar />
				</Dialog>
			</Popover>
		</ReactAriaDatePicker>
	);
}
