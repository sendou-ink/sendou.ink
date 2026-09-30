import { TeamSearch } from "~/components/elements/TeamSearch";
import type { FormFieldProps, TeamSearchFieldOptions } from "../types";
import {
	FormFieldMessages,
	SearchFormFieldWrapper,
	useTranslatedTexts,
} from "./FormFieldWrapper";

type TeamSearchFormFieldProps = FormFieldProps<"team-search"> &
	TeamSearchFieldOptions & {
		onChange: (value: number | null) => void;
		disabled?: boolean;
	};

export function TeamSearchFormField({
	name,
	label,
	bottomText,
	error,
	required,
	onChange,
	onBlur,
	onTeamSelected,
	initialTeam,
	disabled,
}: TeamSearchFormFieldProps) {
	const { translatedLabel } = useTranslatedTexts({
		label,
	});

	return (
		<SearchFormFieldWrapper>
			<TeamSearch
				initialTeam={initialTeam}
				onChange={(team) => {
					onChange(team?.id ?? null);
					onTeamSelected?.(team);
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
