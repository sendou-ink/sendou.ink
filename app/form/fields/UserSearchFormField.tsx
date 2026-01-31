import { UserSearch } from "~/components/elements/UserSearch";
import type { FormFieldProps } from "../types";
import { FormFieldMessages, useTranslatedTexts } from "./FormFieldWrapper";
import styles from "./UserSearchFormField.module.css";

type UserSearchFormFieldProps = FormFieldProps<"user-search"> & {
	value: number | null;
	onChange: (value: number | null) => void;
};

export function UserSearchFormField({
	name,
	label,
	bottomText,
	error,
	required,
	value,
	onChange,
	onBlur,
}: UserSearchFormFieldProps) {
	const { translatedLabel, translatedError } = useTranslatedTexts({
		label,
		error,
	});

	return (
		<div className={styles.root}>
			<UserSearch
				initialUserId={value ?? undefined}
				onChange={(user) => onChange(user?.id ?? null)}
				onBlur={() => onBlur?.()}
				label={translatedLabel}
				isRequired={required}
				errorText={translatedError}
			/>
			<FormFieldMessages name={name} bottomText={bottomText} />
		</div>
	);
}
