import { WeaponSelect } from "~/components/WeaponSelect";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./WeaponSelectFormField.module.css";

type WeaponSelectFormFieldProps = FormFieldProps<"weapon-select"> & {
	value: MainWeaponId | null;
	onChange: (value: MainWeaponId | null) => void;
};

export function WeaponSelectFormField({
	name,
	label,
	bottomText,
	error,
	required,
	value,
	onChange,
	onBlur,
}: WeaponSelectFormFieldProps) {
	const { translatedLabel, translatedError } = useTranslatedTexts({
		label,
		error,
	});

	return (
		<div className={styles.root}>
			<WeaponSelect
				label={translatedLabel}
				value={value}
				onChange={(id) => {
					onChange(id);
					onBlur?.(id);
				}}
				isRequired={required}
				clearable={!required}
			/>
			<FormFieldMessages
				name={name}
				error={translatedError}
				bottomText={bottomText}
			/>
		</div>
	);
}
