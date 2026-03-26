import * as React from "react";
import { SendouSwitch } from "~/components/elements/Switch";
import type { FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";

type SwitchFormFieldProps = Omit<FormFieldProps<"switch">, "onBlur"> & {
	checked: boolean;
	onChange: (checked: boolean) => void;
	isDisabled?: boolean;
};

export function SwitchFormField({
	name,
	label,
	bottomText,
	error,
	checked,
	onChange,
	isDisabled,
}: SwitchFormFieldProps) {
	const id = React.useId();
	const { translatedLabel } = useTranslatedTexts({ label });

	return (
		<div className="stack xs">
			<div className="stack horizontal sm items-center">
				<SendouSwitch
					id={id}
					isSelected={checked}
					onChange={onChange}
					isDisabled={isDisabled}
				>
					{translatedLabel}
				</SendouSwitch>
			</div>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</div>
	);
}
