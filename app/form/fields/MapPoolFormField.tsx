import * as React from "react";
import { useTranslation } from "react-i18next";
import { MapPoolPicker } from "~/components/MapPoolPicker";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { FormFieldProps, MapPoolFieldOptions } from "../types";
import { FormFieldWrapper } from "./FormFieldWrapper";

type MapPoolFormFieldProps = FormFieldProps<"map-pool"> &
	MapPoolFieldOptions & {
		value: string;
		onChange: (value: string) => void;
		disabled?: boolean;
	};

export function MapPoolFormField({
	name,
	label,
	bottomText,
	error,
	onBlur,
	value,
	onChange,
	disabled,
	quickFill,
	modes,
	sendouQFilter,
}: MapPoolFormFieldProps) {
	const { t } = useTranslation(["forms"]);
	const id = React.useId();

	const handleChange = (newMapPool: MapPool) => {
		onChange(newMapPool.serialized);
		onBlur(newMapPool.serialized);
	};

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={label}
			error={error}
			bottomText={bottomText}
		>
			<MapPoolPicker
				mapPool={value ? new MapPool(value) : MapPool.EMPTY}
				onChange={handleChange}
				quickFill={quickFill}
				modes={modes}
				sendouQFilter={sendouQFilter}
				disabled={disabled}
				aria-label={label ? t(label as never) : undefined}
			/>
		</FormFieldWrapper>
	);
}
