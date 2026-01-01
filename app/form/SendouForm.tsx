import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import type { z } from "zod";
import { SubmitButton } from "~/components/SubmitButton";
import { formRegistry } from "./fields";
import styles from "./SendouForm.module.css";
import type { FormField } from "./types";
import { validateField } from "./utils";

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
}

const FormContext = React.createContext<FormContextValue | null>(null);

type FormNames<T extends z.ZodRawShape> = {
	[K in keyof T]: K;
};

export interface FormRenderProps<T extends z.ZodRawShape> {
	names: FormNames<T>;
}

interface SendouFormProps<T extends z.ZodRawShape> {
	children: React.ReactNode | ((props: FormRenderProps<T>) => React.ReactNode);
	schema: z.ZodObject<T>;
	defaultValues?: Partial<z.infer<z.ZodObject<T>>> | null;
	submitButtonText?: React.ReactNode;
	action?: string;
	method?: "post" | "get";
	_action?: string;
	submitButtonTestId?: string;
	autoSubmit?: boolean;
}

export function SendouForm<T extends z.ZodRawShape>({
	children,
	schema,
	defaultValues,
	submitButtonText,
	action,
	method = "post",
	_action,
	submitButtonTestId,
	autoSubmit,
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

		if (Object.keys(newErrors).length > 0) {
			setClientErrors(newErrors);
			return;
		}

		fetcher.submit(values as Record<string, string>, {
			method,
			action,
			encType: "application/json",
		});
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
		values,
		setValue,
	};

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
				className={styles.form}
				onSubmit={handleSubmit}
			>
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
