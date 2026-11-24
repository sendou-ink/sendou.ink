import * as React from "react";
import type { FormFieldProps } from "../types";
import { ariaAttributes, labelId } from "../utils";
import {
	FormFieldGroup,
	FormFieldMessages,
	FormFieldWrapper,
	useTranslatedTexts,
} from "./FormFieldWrapper";

type TimeRange = { start: string; end: string } | null;

type TimeRangeFormFieldProps = Omit<FormFieldProps<"time-range">, "onBlur"> & {
	value: TimeRange;
	onChange: (value: TimeRange) => void;
	onBlur?: () => void;
	disabled?: boolean;
};

export function TimeRangeFormField({
	name,
	label,
	bottomText,
	startLabel,
	endLabel,
	error,
	onBlur,
	value,
	onChange,
	disabled,
}: TimeRangeFormFieldProps) {
	const id = React.useId();
	const startId = React.useId();
	const endId = React.useId();
	const { "aria-invalid": ariaInvalid } = ariaAttributes({
		name,
		error,
		bottomText,
	});

	const { translatedLabel } = useTranslatedTexts({ label });
	const { translatedLabel: translatedStartLabel } = useTranslatedTexts({
		label: startLabel,
	});
	const { translatedLabel: translatedEndLabel } = useTranslatedTexts({
		label: endLabel,
	});

	const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newStart = e.target.value;
		if (!newStart && !value?.end) {
			onChange(null);
		} else {
			onChange({ start: newStart, end: value?.end ?? "" });
		}
	};

	const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newEnd = e.target.value;
		if (!newEnd && !value?.start) {
			onChange(null);
		} else {
			onChange({ start: value?.start ?? "", end: newEnd });
		}
	};

	return (
		<FormFieldGroup
			labelledBy={translatedLabel ? labelId(id) : undefined}
			name={name}
			error={error}
			bottomText={bottomText}
			className="stack xs"
		>
			{translatedLabel ? (
				<span id={labelId(id)} className="text-sm font-semi-bold">
					{translatedLabel}
				</span>
			) : null}
			<div className="stack horizontal sm">
				<FormFieldWrapper id={startId} label={translatedStartLabel}>
					<input
						id={startId}
						type="time"
						value={value?.start ?? ""}
						onChange={handleStartChange}
						onBlur={() => onBlur?.()}
						disabled={disabled}
						aria-invalid={ariaInvalid}
						className="size-extra-small"
					/>
				</FormFieldWrapper>
				<FormFieldWrapper id={endId} label={translatedEndLabel}>
					<input
						id={endId}
						type="time"
						value={value?.end ?? ""}
						onChange={handleEndChange}
						onBlur={() => onBlur?.()}
						disabled={disabled}
						aria-invalid={ariaInvalid}
						className="size-extra-small"
					/>
				</FormFieldWrapper>
			</div>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</FormFieldGroup>
	);
}
