import * as React from "react";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import type { FormFieldProps } from "../types";

export type WeaponPoolItem = {
	id: number;
	isFavorite: boolean;
};

type WeaponPoolFormFieldProps = FormFieldProps<"weapon-pool"> & {
	value: WeaponPoolItem[];
	onChange: (value: WeaponPoolItem[]) => void;
};

// xxx: implement
export function WeaponPoolFormField({
	label,
	name,
	bottomText,
	error,
	value,
	onChange: _onChange,
}: WeaponPoolFormFieldProps) {
	const id = React.useId();

	return (
		<div className="stack xs">
			{label ? <Label htmlFor={id}>{label}</Label> : null}
			<div>
				{/* Weapon pool picker would go here - using existing weapon selector components */}
				<input type="hidden" name={name} value={JSON.stringify(value)} />
			</div>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
			{bottomText && !error ? (
				<FormMessage type="info">{bottomText}</FormMessage>
			) : null}
		</div>
	);
}
