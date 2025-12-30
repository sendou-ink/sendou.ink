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
import { CalendarIcon } from "../icons/Calendar";
import styles from "./DatePicker.module.css";
import { SendouLabel } from "./Label";

interface SendouDatePickerProps<T extends DateValue>
	extends DatePickerProps<T> {
	label: string;
	bottomText?: string;
	errorText?: string;
}

export function SendouDatePicker<T extends DateValue>({
	label,
	errorText,
	bottomText,
	isRequired,
	...rest
}: SendouDatePickerProps<T>) {
	return (
		<ReactAriaDatePicker
			{...rest}
			validationBehavior="aria"
			className={styles.root}
		>
			<SendouLabel required={isRequired}>{label}</SendouLabel>
			<Group className={styles.group}>
				<DateInput className={styles.dateInput}>
					{(segment) => (
						<DateSegment segment={segment} className={styles.segment} />
					)}
				</DateInput>
				<Button data-testid="open-calendar-button" className={styles.button}>
					<CalendarIcon className={styles.icon} />
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
