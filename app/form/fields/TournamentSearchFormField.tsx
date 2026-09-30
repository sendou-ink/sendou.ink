import {
	TournamentSearch,
	type TournamentSearchItem,
} from "~/components/elements/TournamentSearch";
import type { FormFieldProps } from "../types";
import {
	FormFieldMessages,
	SearchFormFieldWrapper,
	useTranslatedTexts,
} from "./FormFieldWrapper";

type TournamentSearchFormFieldProps = FormFieldProps<"tournament-search"> & {
	value: number | null;
	onChange: (value: number | null) => void;
	onTournamentSelected?: (tournament: TournamentSearchItem | null) => void;
	pastOnly?: boolean;
	disabled?: boolean;
};

export function TournamentSearchFormField({
	name,
	label,
	bottomText,
	error,
	required,
	value,
	onChange,
	onTournamentSelected,
	onBlur,
	pastOnly,
	disabled,
}: TournamentSearchFormFieldProps) {
	const { translatedLabel } = useTranslatedTexts({
		label,
	});

	return (
		<SearchFormFieldWrapper>
			<TournamentSearch
				initialTournamentId={value ?? undefined}
				pastOnly={pastOnly}
				onChange={(tournament) => {
					onChange(tournament?.id ?? null);
					onTournamentSelected?.(tournament);
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
