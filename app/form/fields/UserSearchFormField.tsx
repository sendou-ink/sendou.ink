import { UserSearch } from "~/components/elements/UserSearch";
import type { FormFieldProps, UserSearchFieldOptions } from "../types";
import {
	FormFieldMessages,
	SearchFormFieldWrapper,
	useTranslatedTexts,
} from "./FormFieldWrapper";

type UserSearchFormFieldProps = FormFieldProps<"user-search"> &
	UserSearchFieldOptions & {
		value: number | null;
		onChange: (value: number | null) => void;
		disabled?: boolean;
	};

export function UserSearchFormField({
	name,
	label,
	bottomText,
	error,
	required,
	value,
	onChange,
	onUserSelected,
	onBlur,
	disabled,
}: UserSearchFormFieldProps) {
	const { translatedLabel } = useTranslatedTexts({
		label,
	});

	return (
		<SearchFormFieldWrapper>
			<UserSearch
				initialUserId={value ?? undefined}
				onChange={(user) => {
					onChange(user?.id ?? null);
					onUserSelected?.(user);
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
