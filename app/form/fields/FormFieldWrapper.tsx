import type * as React from "react";
import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import {
	ariaAttributes,
	errorMessageId,
	infoMessageId,
	labelId,
} from "../utils";
import styles from "./FormFieldWrapper.module.css";

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
				<FormMessage
					type="info"
					spaced={false}
					id={name ? infoMessageId(name) : undefined}
				>
					{translatedBottomText}
				</FormMessage>
			) : null}
		</>
	);
}

interface FormFieldWrapperProps {
	/** Id of the field's control; its label gets `labelId(id)`. */
	id: string;
	/** The field is several controls in a group named by the label via `labelId(id)`, so the label points at no single control. */
	isGroup?: boolean;
	name?: string;
	label?: string;
	/** Extra element rendered next to the label, e.g. an `<InfoPopover />` explaining the field's syntax. */
	labelPopover?: React.ReactNode;
	required?: boolean;
	error?: string;
	bottomText?: string;
	valueLimits?: { current: number; max: number };
	children: React.ReactNode;
}

export function FormFieldWrapper({
	id,
	isGroup,
	name,
	label,
	labelPopover,
	required,
	error,
	bottomText,
	valueLimits,
	children,
}: FormFieldWrapperProps) {
	const { translatedLabel } = useTranslatedTexts({ label });

	const labelElement = translatedLabel ? (
		<Label
			id={labelId(id)}
			htmlFor={isGroup ? undefined : id}
			required={required}
			valueLimits={valueLimits}
			spaced={false}
		>
			{translatedLabel}
		</Label>
	) : null;

	return (
		<div className={styles.root}>
			<div className="stack xs">
				{labelElement && labelPopover ? (
					<div className="stack horizontal xs items-center">
						{labelElement}
						{labelPopover}
					</div>
				) : (
					labelElement
				)}
				{children}
				<FormFieldMessages name={name} error={error} bottomText={bottomText} />
			</div>
		</div>
	);
}

/** Wraps the controls of a field made of several (checkboxes, a picker, a list of items) in a group named by the field's label and described by its error and help texts. */
export function FormFieldGroup({
	labelledBy,
	name,
	error,
	bottomText,
	className,
	children,
}: {
	/** Id of the field's label, `labelId(id)` for a `FormFieldWrapper` with `isGroup`; undefined when there is no label. */
	labelledBy?: string;
	name?: string;
	error?: string;
	bottomText?: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset would restyle the field and need the label as its legend
		<div
			role="group"
			aria-labelledby={labelledBy}
			aria-describedby={
				ariaAttributes({ name, error, bottomText })["aria-describedby"]
			}
			className={className}
		>
			{children}
		</div>
	);
}

/** For the entity-search fields, which render their own label through the search component. */
export function SearchFormFieldWrapper({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className={styles.searchRoot}>
			<div className="stack xs">{children}</div>
		</div>
	);
}
