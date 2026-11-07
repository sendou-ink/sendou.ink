import * as React from "react";
import {
	AddressSearch,
	type AddressSearchResult,
} from "~/components/elements/AddressSearch";
import type {
	AddressFieldValue,
	AddressSearchFieldOptions,
	FormFieldProps,
} from "../types";
import {
	FormFieldMessages,
	SearchFormFieldWrapper,
	useTranslatedTexts,
} from "./FormFieldWrapper";

type AddressSearchFormFieldProps = FormFieldProps<"address-search"> &
	AddressSearchFieldOptions & {
		value: AddressFieldValue | null;
		onChange: (value: AddressFieldValue | null) => void;
		disabled?: boolean;
	};

const INITIAL_ADDRESS_ID = -1;

export function AddressSearchFormField({
	name,
	label,
	bottomText,
	error,
	required,
	value,
	onChange,
	onBlur,
	onAddressSelected,
	disabled,
}: AddressSearchFormFieldProps) {
	const { translatedLabel } = useTranslatedTexts({ label });
	// the stored value lacks a result's extras, the search only needs it to render the selection
	const [initialAddress] = React.useState<AddressSearchResult | undefined>(
		() =>
			value
				? {
						...value,
						id: INITIAL_ADDRESS_ID,
						name: value.address,
						placeName: null,
						timezone: "",
					}
				: undefined,
	);

	return (
		<SearchFormFieldWrapper>
			<AddressSearch
				initialAddress={initialAddress}
				onChange={(address) => {
					onChange(
						address
							? {
									address: address.address,
									city: address.city,
									countryCode: address.countryCode,
									latitude: address.latitude,
									longitude: address.longitude,
								}
							: null,
					);
					onAddressSelected?.(address);
				}}
				onBlur={() => onBlur?.()}
				label={translatedLabel}
				isRequired={required}
				isDisabled={disabled}
			/>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</SearchFormFieldWrapper>
	);
}
