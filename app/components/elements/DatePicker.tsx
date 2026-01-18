import { Calendar } from "lucide-react";
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
import styles from "./DatePicker.module.css";
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
					<Calendar className={styles.icon} />
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
