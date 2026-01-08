import { StageSelect } from "~/components/StageSelect";
import type { StageId } from "~/modules/in-game-lists/types";
import type { FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./StageSelectFormField.module.css";

type StageSelectFormFieldProps = FormFieldProps<"stage-select"> & {
	value: StageId | null;
	onChange: (value: StageId) => void;
};

export function StageSelectFormField({
	name,
	label,
	bottomText,
	error,
	required,
	value,
	onChange,
	onBlur,
}: StageSelectFormFieldProps) {
	const { translatedLabel, translatedError } = useTranslatedTexts({
		label,
		error,
	});

	return (
		<div className={styles.root}>
			<StageSelect
				label={translatedLabel}
				value={value}
				onChange={(id) => {
					onChange(id);
					onBlur?.(id);
				}}
				isRequired={required}
			/>
			<FormFieldMessages
				name={name}
				error={translatedError}
				bottomText={bottomText}
			/>
		</div>
	);
}
