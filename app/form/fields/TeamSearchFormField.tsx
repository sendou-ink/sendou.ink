import { TeamSearch } from "~/components/elements/TeamSearch";
import type { FormFieldProps, TeamSearchFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./UserSearchFormField.module.css";

type TeamSearchFormFieldProps = FormFieldProps<"team-search"> &
	TeamSearchFieldProps & {
		onChange: (value: number | null) => void;
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
}: TeamSearchFormFieldProps) {
	const { translatedLabel } = useTranslatedTexts({
		label,
	});

	return (
		<div className={styles.root}>
			<div className="stack xs">
				<TeamSearch
					initialTeam={initialTeam}
					onChange={(team) => {
						onChange(team?.id ?? null);
						onTeamSelected?.(team);
					}}
					onBlur={() => onBlur?.()}
					label={translatedLabel}
					isRequired={required}
				/>
				<FormFieldMessages name={name} error={error} bottomText={bottomText} />
			</div>
		</div>
	);
}
