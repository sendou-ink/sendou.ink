import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	AddressSearch,
	type AddressSearchResult,
} from "~/components/elements/AddressSearch";
import { SendouButton } from "~/components/elements/Button";
import { useCountryOptions } from "~/hooks/useCountryOptions";
import { parseCoordinates } from "~/utils/coordinates";
import type {
	AddressFieldValue,
	AddressSearchFieldOptions,
	FormFieldProps,
} from "../types";
import { ariaAttributes } from "../utils";
import {
	FormFieldMessages,
	SearchFormFieldWrapper,
	useTranslatedTexts,
} from "./FormFieldWrapper";
import { InputFormField } from "./InputFormField";
import { SelectFormField } from "./SelectFormField";

type AddressSearchFormFieldProps = FormFieldProps<"address-search"> &
	AddressSearchFieldOptions & {
		value: AddressFieldValue | null;
		onChange: (value: AddressFieldValue | null) => void;
		disabled?: boolean;
	};

const INITIAL_ADDRESS_ID = -1;
const ADDRESS_MAX_LENGTH = 300;
const CITY_MAX_LENGTH = 100;

interface ManualAddress {
	address: string;
	city: string;
	countryCode: string | null;
	coordinates: string;
}

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
	tournamentId,
	disabled,
}: AddressSearchFormFieldProps) {
	const { t } = useTranslation(["common"]);
	const { translatedLabel } = useTranslatedTexts({ label });
	const [isManual, setIsManual] = React.useState(false);
	// the stored value lacks a result's extras, the search only needs it to render the selection
	const [initialAddress, setInitialAddress] = React.useState(() =>
		valueToSearchResult(value),
	);

	const switchToSearch = () => {
		setInitialAddress(valueToSearchResult(value));
		setIsManual(false);
	};

	const entryModeFooter = (
		<>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
			<SendouButton
				variant="minimal"
				size="miniscule"
				className="self-start"
				onClick={isManual ? switchToSearch : () => setIsManual(true)}
				isDisabled={disabled}
				testId="address-entry-mode-button"
			>
				{isManual
					? t("common:forms.addressSearch.searchInstead")
					: t("common:forms.addressSearch.enterManually")}
			</SendouButton>
		</>
	);

	if (isManual) {
		return (
			<ManualAddressFields
				name={name}
				error={error}
				bottomText={bottomText}
				label={translatedLabel}
				required={required}
				disabled={disabled}
				value={value}
				onChange={onChange}
				onBlur={() => onBlur?.()}
				footer={entryModeFooter}
			/>
		);
	}

	return (
		<SearchFormFieldWrapper>
			<AddressSearch
				initialAddress={initialAddress}
				tournamentId={tournamentId}
				onChange={(address) => {
					onChange(address ? searchResultToValue(address) : null);
					onAddressSelected?.(address);
				}}
				onBlur={() => onBlur?.()}
				label={translatedLabel}
				isRequired={required}
				isDisabled={disabled}
				{...ariaAttributes({ name, error, bottomText })}
			/>
			{entryModeFooter}
		</SearchFormFieldWrapper>
	);
}

function ManualAddressFields({
	name,
	error,
	bottomText,
	label,
	required,
	disabled,
	value,
	onChange,
	onBlur,
	footer,
}: {
	name: string;
	/** Error of the address as a whole, rendered in `footer`. */
	error?: string;
	bottomText?: string;
	label?: string;
	required?: boolean;
	disabled?: boolean;
	value: AddressFieldValue | null;
	onChange: (value: AddressFieldValue | null) => void;
	onBlur: () => void;
	/** Rendered right under the last field, e.g. the field's messages. */
	footer: React.ReactNode;
}) {
	const { t } = useTranslation(["common"]);
	const countryOptions = useCountryOptions();
	const [manualAddress, setManualAddress] = React.useState<ManualAddress>(() =>
		valueToManualAddress(value),
	);

	const update = (changes: Partial<ManualAddress>) => {
		const updated = { ...manualAddress, ...changes };
		setManualAddress(updated);
		onChange(manualAddressToValue(updated));
	};

	const addressInfo = t("common:forms.addressSearch.manual.addressInfo");
	const addressAria = withFieldMessages(
		ariaAttributes({
			name: `${name}.address`,
			bottomText: addressInfo,
			required: required ?? false,
		}),
		ariaAttributes({ name, error, bottomText }),
	);

	const hasInvalidCoordinates =
		manualAddress.coordinates.trim() !== "" &&
		!parseCoordinates(manualAddress.coordinates);

	return (
		<div className="stack md-plus">
			<InputFormField
				name={`${name}.address`}
				label={label}
				bottomText={addressInfo}
				required={required ?? false}
				maxLength={ADDRESS_MAX_LENGTH}
				aria={addressAria}
				disabled={disabled}
				value={manualAddress.address}
				onChange={(address) => update({ address })}
				onBlur={onBlur}
			/>
			<InputFormField
				name={`${name}.city`}
				label={t("common:forms.addressSearch.manual.city")}
				required={false}
				maxLength={CITY_MAX_LENGTH}
				disabled={disabled}
				value={manualAddress.city}
				onChange={(city) => update({ city })}
				onBlur={onBlur}
			/>
			<SelectFormField
				name={`${name}.countryCode`}
				label={t("common:forms.addressSearch.manual.country")}
				items={countryOptions}
				clearable={false}
				searchable
				disabled={disabled}
				value={manualAddress.countryCode}
				onChange={(countryCode) => update({ countryCode })}
				onBlur={onBlur}
			/>
			<div className="stack xs">
				<InputFormField
					name={`${name}.coordinates`}
					label={t("common:forms.addressSearch.manual.coordinates")}
					bottomText={t("common:forms.addressSearch.manual.coordinatesInfo")}
					error={
						hasInvalidCoordinates
							? t("common:forms.addressSearch.manual.coordinatesInvalid")
							: undefined
					}
					placeholder="30.2636, -97.7397"
					required={required ?? false}
					maxLength={100}
					disabled={disabled}
					value={manualAddress.coordinates}
					onChange={(coordinates) => update({ coordinates })}
					onBlur={onBlur}
				/>
				{footer}
			</div>
		</div>
	);
}

/** Points an input of a composite field at the field's own error and help text too. */
function withFieldMessages(
	inputAria: ReturnType<typeof ariaAttributes>,
	fieldAria: ReturnType<typeof ariaAttributes>,
): ReturnType<typeof ariaAttributes> {
	const describedBy = [
		fieldAria["aria-describedby"],
		inputAria["aria-describedby"],
	]
		.filter((ids) => ids !== undefined)
		.join(" ");

	return {
		...inputAria,
		"aria-invalid": inputAria["aria-invalid"] ?? fieldAria["aria-invalid"],
		"aria-errormessage":
			inputAria["aria-errormessage"] ?? fieldAria["aria-errormessage"],
		"aria-describedby": describedBy !== "" ? describedBy : undefined,
	};
}

function valueToSearchResult(
	value: AddressFieldValue | null,
): AddressSearchResult | undefined {
	if (!value) return;

	return {
		...value,
		id: INITIAL_ADDRESS_ID,
		name: value.address,
		placeName: null,
		timezone: null,
	};
}

function searchResultToValue(address: AddressSearchResult): AddressFieldValue {
	return {
		address: address.address,
		city: address.city,
		countryCode: address.countryCode,
		latitude: address.latitude,
		longitude: address.longitude,
	};
}

function valueToManualAddress(value: AddressFieldValue | null): ManualAddress {
	return {
		address: value?.address ?? "",
		city: value?.city ?? "",
		countryCode: value?.countryCode ?? null,
		coordinates: value ? `${value.latitude}, ${value.longitude}` : "",
	};
}

function manualAddressToValue(
	manualAddress: ManualAddress,
): AddressFieldValue | null {
	const address = manualAddress.address.trim();
	const coordinates = parseCoordinates(manualAddress.coordinates);
	if (!address || !manualAddress.countryCode || !coordinates) return null;

	return {
		address,
		city: manualAddress.city.trim() || null,
		countryCode: manualAddress.countryCode,
		...coordinates,
	};
}
