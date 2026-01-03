import * as React from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import type { z } from "zod";
import { FormMessage } from "~/components/FormMessage";
import { SubmitButton } from "~/components/SubmitButton";
import { formRegistry } from "./fields";
import styles from "./SendouForm.module.css";
import type { FormField } from "./types";
import { errorMessageId, validateField } from "./utils";

type RequiredDefaultKeys<T extends z.ZodRawShape> = {
	[K in keyof T & string]: T[K] extends { _requiresDefault: true } ? K : never;
}[keyof T & string];

type HasRequiredDefaults<T extends z.ZodRawShape> =
	RequiredDefaultKeys<T> extends never ? false : true;

export interface FormContextValue<T extends z.ZodRawShape = z.ZodRawShape> {
	schema: z.ZodObject<T>;
	defaultValues?: Partial<z.infer<z.ZodObject<T>>> | null;
	serverErrors: Partial<Record<keyof z.infer<z.ZodObject<T>>, string>>;
	clientErrors: Partial<Record<string, string>>;
	hasSubmitted: boolean;
	setClientError: (name: string, error: string | undefined) => void;
	onFieldChange?: (name: string, newValue: unknown) => void;
	values: Record<string, unknown>;
	setValue: (name: string, value: unknown) => void;
	revalidateAll: (updatedValues: Record<string, unknown>) => void;
}

const FormContext = React.createContext<FormContextValue | null>(null);

type FormNames<T extends z.ZodRawShape> = {
	[K in keyof T]: K;
};

export interface FormRenderProps<T extends z.ZodRawShape> {
	names: FormNames<T>;
}

type BaseFormProps<T extends z.ZodRawShape> = {
	children: React.ReactNode | ((props: FormRenderProps<T>) => React.ReactNode);
	schema: z.ZodObject<T>;
	title?: React.ReactNode;
	submitButtonText?: React.ReactNode;
	action?: string;
	method?: "post" | "get";
	_action?: string;
	submitButtonTestId?: string;
	autoSubmit?: boolean;
	className?: string;
};

type SendouFormProps<T extends z.ZodRawShape> = BaseFormProps<T> &
	(HasRequiredDefaults<T> extends true
		? {
				defaultValues: Partial<z.infer<z.ZodObject<T>>> &
					Record<RequiredDefaultKeys<T>, unknown>;
			}
		: { defaultValues?: Partial<z.infer<z.ZodObject<T>>> | null });

export function SendouForm<T extends z.ZodRawShape>({
	children,
	schema,
	defaultValues,
	title,
	submitButtonText,
	action,
	method = "post",
	_action,
	submitButtonTestId,
	autoSubmit,
	className,
}: SendouFormProps<T>) {
	const { t } = useTranslation(["forms"]);
	const fetcher = useFetcher<{ fieldErrors?: Record<string, string> }>();
	const [hasSubmitted, setHasSubmitted] = React.useState(false);
	const [clientErrors, setClientErrors] = React.useState<
		Partial<Record<string, string>>
	>({});
	const [visibleServerErrors, setVisibleServerErrors] = React.useState<
		Partial<Record<string, string>>
	>({});
	const [fallbackError, setFallbackError] = React.useState<string | null>(null);

	const initialValues = buildInitialValues(schema, defaultValues);
	const [values, setValues] =
		React.useState<Record<string, unknown>>(initialValues);

	const latestActionData = React.useRef(fetcher.data);
	if (fetcher.data !== latestActionData.current) {
		latestActionData.current = fetcher.data;
		setVisibleServerErrors(fetcher.data?.fieldErrors ?? {});
	}

	const serverErrors = visibleServerErrors as Partial<
		Record<keyof z.infer<z.ZodObject<T>>, string>
	>;

	const setClientError = (name: string, error: string | undefined) => {
		setClientErrors((prev) => {
			if (error === undefined) {
				const next = { ...prev };
				delete next[name];
				return next;
			}
			return { ...prev, [name]: error };
		});
	};

	const setValue = (name: string, newValue: unknown) => {
		setValues((prev) => ({ ...prev, [name]: newValue }));
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setHasSubmitted(true);
		setVisibleServerErrors({});

		const newErrors: Record<string, string> = {};

		for (const key of Object.keys(schema.shape)) {
			const error = validateField(schema, key, values[key]);
			if (error) {
				newErrors[key] = error;
			}
		}

		const fullValidation = schema.safeParse(values);
		if (!fullValidation.success) {
			for (const issue of fullValidation.error.issues) {
				const fieldName = issue.path[0];
				if (typeof fieldName === "string" && !newErrors[fieldName]) {
					newErrors[fieldName] = issue.message;
				}
			}
		}

		if (Object.keys(newErrors).length > 0) {
			flushSync(() => {
				setClientErrors(newErrors);
			});
			scrollToFirstError(newErrors);
			return;
		}

		fetcher.submit(values as Record<string, string>, {
			method,
			action,
			encType: "application/json",
		});
	};

	const revalidateAll = (updatedValues: Record<string, unknown>) => {
		const newErrors: Record<string, string> = {};

		for (const key of Object.keys(schema.shape)) {
			const error = validateField(schema, key, updatedValues[key]);
			if (error) {
				newErrors[key] = error;
			}
		}

		const fullValidation = schema.safeParse(updatedValues);
		if (!fullValidation.success) {
			for (const issue of fullValidation.error.issues) {
				const fieldName = issue.path[0];
				if (typeof fieldName === "string" && !newErrors[fieldName]) {
					newErrors[fieldName] = issue.message;
				}
			}
		}

		setClientErrors(newErrors);
	};

	const onFieldChange = autoSubmit
		? (changedName: string, changedValue: unknown) => {
				const updatedValues = { ...values, [changedName]: changedValue };

				const newErrors: Record<string, string> = {};
				for (const key of Object.keys(schema.shape)) {
					const error = validateField(schema, key, updatedValues[key]);
					if (error) {
						newErrors[key] = error;
					}
				}

				if (Object.keys(newErrors).length > 0) {
					setClientErrors(newErrors);
					return;
				}

				fetcher.submit(updatedValues as Record<string, string>, {
					method,
					action,
					encType: "application/json",
				});
			}
		: undefined;

	const contextValue: FormContextValue<T> = {
		schema,
		defaultValues,
		serverErrors,
		clientErrors,
		hasSubmitted,
		setClientError,
		onFieldChange,
		revalidateAll,
		values,
		setValue,
	};

	function scrollToFirstError(errors: Record<string, string>) {
		const firstErrorField = Object.keys(errors)[0];
		if (!firstErrorField) return;

		const errorElement = document.getElementById(
			errorMessageId(firstErrorField),
		);
		if (errorElement) {
			errorElement.scrollIntoView({ behavior: "smooth", block: "center" });
			setFallbackError(null);
		} else {
			const firstError = errors[firstErrorField];
			setFallbackError(
				firstError ? `${t(firstError as never)} (${firstErrorField})` : null,
			);
		}
	}

	const names = Object.fromEntries(
		Object.keys(schema.shape).map((key) => [key, key]),
	) as FormNames<T>;

	const resolvedChildren =
		typeof children === "function" ? children({ names }) : children;

	return (
		<FormContext.Provider value={contextValue as FormContextValue}>
			<form
				method={method}
				action={action}
				className={className ?? styles.form}
				onSubmit={handleSubmit}
			>
				{title ? <h2 className={styles.title}>{title}</h2> : null}
				{resolvedChildren}
				{autoSubmit ? null : (
					<div className="mt-4 stack mx-auto justify-center">
						<SubmitButton
							_action={_action}
							testId={submitButtonTestId}
							state={fetcher.state}
						>
							{submitButtonText ?? t("submit")}
						</SubmitButton>
					</div>
				)}
				{fallbackError ? (
					<div className="mt-4 mx-auto">
						<FormMessage type="error">{fallbackError}</FormMessage>
					</div>
				) : null}
			</form>
		</FormContext.Provider>
	);
}

function buildInitialValues<T extends z.ZodRawShape>(
	schema: z.ZodObject<T>,
	defaultValues?: Partial<z.infer<z.ZodObject<T>>> | null,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [key, fieldSchema] of Object.entries(schema.shape)) {
		// @ts-expect-error Type instantiation is excessively deep and possibly infinite
		const formField = formRegistry.get(fieldSchema as z.ZodType) as
			| FormField
			| undefined;

		if (defaultValues && key in defaultValues) {
			result[key] = defaultValues[key as keyof typeof defaultValues];
		} else if (formField) {
			result[key] = formField.initialValue;
		}
	}

	return result;
}

export function useFormFieldContext() {
	const context = React.useContext(FormContext);
	if (!context) {
		throw new Error("useFormFieldContext must be used within a FormProvider");
	}
	return context;
}

export function useOptionalFormFieldContext() {
	return React.useContext(FormContext);
}
