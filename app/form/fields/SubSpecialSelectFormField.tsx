import { useTranslation } from "react-i18next";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { SpecialWeaponImage, SubWeaponImage } from "~/components/Image";
import type {
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	specialWeaponIds,
	subWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import type { FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./SubSpecialSelectFormField.module.css";

type SubSpecialSelectFormFieldProps = FormFieldProps<
	"sub-weapon-select" | "special-weapon-select"
> & {
	weaponType: "SUB" | "SPECIAL";
	value: SubWeaponId | SpecialWeaponId | null;
	onChange: (value: SubWeaponId | SpecialWeaponId | null) => void;
	disabled?: boolean;
};

export function SubSpecialSelectFormField({
	name,
	label,
	bottomText,
	error,
	required,
	weaponType,
	value,
	onChange,
	onBlur,
	disabled,
}: SubSpecialSelectFormFieldProps) {
	const { t } = useTranslation(["weapons"]);
	const { translatedLabel } = useTranslatedTexts({ label });

	const options: Array<{ id: number; name: string }> =
		weaponType === "SUB"
			? subWeaponIds.map((id) => ({ id, name: t(`weapons:SUB_${id}`) }))
			: specialWeaponIds.map((id) => ({
					id,
					name: t(`weapons:SPECIAL_${id}`),
				}));

	return (
		<div className={styles.root}>
			<SendouSelect
				label={translatedLabel}
				items={options}
				selectedKey={value}
				onSelectionChange={(key) => {
					const newValue = key === null ? null : (Number(key) as SubWeaponId);
					onChange(newValue);
					onBlur?.(newValue);
				}}
				isRequired={required}
				clearable={!required}
				isDisabled={disabled}
			>
				{(option) => (
					<SendouSelectItem
						key={option.id}
						id={option.id}
						textValue={option.name}
					>
						<span className={styles.option}>
							{weaponType === "SUB" ? (
								<SubWeaponImage
									subWeaponId={option.id as SubWeaponId}
									size={24}
								/>
							) : (
								<SpecialWeaponImage
									specialWeaponId={option.id as SpecialWeaponId}
									size={24}
								/>
							)}
							{option.name}
						</span>
					</SendouSelectItem>
				)}
			</SendouSelect>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</div>
	);
}
