import { TournamentSearch } from "~/components/elements/TournamentSearch";
import type { FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./UserSearchFormField.module.css";

type TournamentSearchFormFieldProps = FormFieldProps<"tournament-search"> & {
	value: number | null;
	onChange: (value: number | null) => void;
};

export function TournamentSearchFormField({
	name,
	label,
	bottomText,
	error,
	required,
	value,
	onChange,
	onBlur,
}: TournamentSearchFormFieldProps) {
	const { translatedLabel } = useTranslatedTexts({
		label,
	});

	return (
		<div className={styles.root}>
			<TournamentSearch
				initialTournamentId={value ?? undefined}
				onChange={(tournament) => onChange(tournament?.id ?? null)}
				onBlur={() => onBlur?.()}
				label={translatedLabel}
				isRequired={required}
			/>
			<FormFieldMessages name={name} error={error} bottomText={bottomText} />
		</div>
	);
}
