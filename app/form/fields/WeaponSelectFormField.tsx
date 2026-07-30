import { WeaponSelect } from "~/components/WeaponSelect";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./WeaponSelectFormField.module.css";

type WeaponSelectFormFieldProps = FormFieldProps<"weapon-select"> & {
	value: MainWeaponId | null;
	onChange: (value: MainWeaponId | null) => void;
	disabled?: boolean;
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
	disabled,
}: WeaponSelectFormFieldProps) {
	const { translatedLabel } = useTranslatedTexts({ label });

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
				isDisabled={disabled}
			/>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</div>
	);
}
