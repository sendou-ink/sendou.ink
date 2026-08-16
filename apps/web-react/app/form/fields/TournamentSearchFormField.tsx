import {
	TournamentSearch,
	type TournamentSearchItem,
} from "~/components/elements/TournamentSearch";
import type { FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./UserSearchFormField.module.css";

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
		<div className={styles.root}>
			<div className="stack xs">
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
			</div>
		</div>
	);
}
