import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouSwitch } from "~/components/elements/Switch";
import type { FormFieldProps } from "../types";
import { FormFieldMessages } from "./FormFieldWrapper";

type SwitchFormFieldProps = Omit<
	FormFieldProps<"switch">,
	"onBlur" | "name"
> & {
	checked: boolean;
	onChange: (checked: boolean) => void;
	isDisabled?: boolean;
};

export function SwitchFormField({
	label,
	bottomText,
	error,
	checked,
	onChange,
	isDisabled,
}: SwitchFormFieldProps) {
	const { t } = useTranslation();
	const id = React.useId();

	const translatedLabel = label?.includes(":") ? t(label as never) : label;
	const translatedError = error?.includes(":") ? t(error as never) : error;
	const translatedBottomText = bottomText?.includes(":")
		? t(bottomText as never)
		: bottomText;

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
			<FormFieldMessages
				error={translatedError}
				bottomText={translatedBottomText}
			/>
		</div>
	);
}
