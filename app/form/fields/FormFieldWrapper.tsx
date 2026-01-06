import type * as React from "react";
import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { errorMessageId } from "../utils";
import styles from "./FormFieldWrapper.module.css";

// xxx: ensure used everywhere
export function useTranslatedTexts({
	label,
	error,
	bottomText,
}: {
	label?: string;
	error?: string;
	bottomText?: string;
}) {
	const { t } = useTranslation(["forms"]);

	return {
		translatedLabel: label?.includes(":") ? t(label as never) : label,
		translatedError: error?.includes(":") ? t(error as never) : error,
		translatedBottomText: bottomText?.includes(":")
			? t(bottomText as never)
			: bottomText,
	};
}

export function FormFieldMessages({
	name,
	error,
	bottomText,
}: {
	name?: string;
	error?: string;
	bottomText?: string;
}) {
	const { translatedError, translatedBottomText } = useTranslatedTexts({
		error,
		bottomText,
	});

	return (
		<>
			{translatedError ? (
				<FormMessage
					type="error"
					spaced={false}
					id={name ? errorMessageId(name) : undefined}
				>
					{translatedError}
				</FormMessage>
			) : null}
			{translatedBottomText ? (
				<FormMessage type="info" spaced={false}>
					{translatedBottomText}
				</FormMessage>
			) : null}
		</>
	);
}

interface FormFieldWrapperProps {
	id: string;
	name?: string;
	label?: string;
	required?: boolean;
	error?: string;
	bottomText?: string;
	valueLimits?: { current: number; max: number };
	children: React.ReactNode;
}

export function FormFieldWrapper({
	id,
	name,
	label,
	required,
	error,
	bottomText,
	valueLimits,
	children,
}: FormFieldWrapperProps) {
	const { translatedLabel } = useTranslatedTexts({ label });

	return (
		<div className={styles.root}>
			<div className="stack xs">
				{translatedLabel ? (
					<Label
						htmlFor={id}
						required={required}
						valueLimits={valueLimits}
						spaced={false}
					>
						{translatedLabel}
					</Label>
				) : null}
				{children}
				<FormFieldMessages name={name} error={error} bottomText={bottomText} />
			</div>
		</div>
	);
}
