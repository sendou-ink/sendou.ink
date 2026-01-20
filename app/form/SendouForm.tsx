import * as React from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useFetcher, useLocation } from "react-router";
import type { z } from "zod";
import { FormMessage } from "~/components/FormMessage";
import { SubmitButton } from "~/components/SubmitButton";
import { FormField as FormFieldComponent } from "./FormField";
import { formRegistry } from "./fields";
import styles from "./SendouForm.module.css";
import type { FormField, TypedFormFieldComponent } from "./types";
import {
	errorMessageId,
	getNestedValue,
	setNestedValue,
	validateField,
} from "./utils";

type RequiredDefaultKeys<T extends z.ZodRawShape> = {
	[K in keyof T & string]: T[K] extends { _requiresDefault: true } ? K : never;
}[keyof T & string];

type HasRequiredDefaults<T extends z.ZodRawShape> =
	RequiredDefaultKeys<T> extends never ? false : true;

export interface FormContextValue<T extends z.ZodRawShape = z.ZodRawShape> {
	schema: z.ZodObject<T>;
	defaultValues?: Partial<z.input<z.ZodObject<T>>> | null;
	serverErrors: Partial<Record<keyof z.infer<z.ZodObject<T>>, string>>;
	clientErrors: Partial<Record<string, string>>;
	hasSubmitted: boolean;
	setClientError: (name: string, error: string | undefined) => void;
	onFieldChange?: (name: string, newValue: unknown) => void;
	values: Record<string, unknown>;
	setValue: (name: string, value: unknown) => void;
	setValueFromPrev: (name: string, updater: (prev: unknown) => unknown) => void;
	revalidateAll: (updatedValues: Record<string, unknown>) => void;
	submitToServer: (values: Record<string, unknown>) => void;
	fetcherState: "idle" | "loading" | "submitting";
}

const FormContext = React.createContext<FormContextValue | null>(null);

type FormNames<T extends z.ZodRawShape> = {
	[K in keyof T]: K;
};

export interface FormRenderProps<T extends z.ZodRawShape> {
	names: FormNames<T>;
	FormField: TypedFormFieldComponent<T>;
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
	onApply?: (values: z.infer<z.ZodObject<T>>) => void;
	secondarySubmit?: React.ReactNode;
};

type SendouFormProps<T extends z.ZodRawShape> = BaseFormProps<T> &
	(HasRequiredDefaults<T> extends true
		? {
				defaultValues: Partial<z.input<z.ZodObject<T>>> &
					Record<RequiredDefaultKeys<T>, unknown>;
			}
		: { defaultValues?: Partial<z.input<z.ZodObject<T>>> | null });

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
	onApply,
	secondarySubmit,
}: SendouFormProps<T>) {
	const { t } = useTranslation(["forms"]);
	const fetcher = useFetcher<{ fieldErrors?: Record<string, string> }>();
	const [hasSubmitted, setHasSubmitted] = React.useState(false);
	const [clientErrors, setClientErrors] = React.useState<
		Partial<Record<string, string>>
	>({});
	const [visibleServerErrors, setVisibleServerErrors] = React.useState<
		Partial<Record<string, string>>
	>(fetcher.data?.fieldErrors ?? {});
	const [fallbackError, setFallbackError] = React.useState<string | null>(null);

	const initialValues = buildInitialValues(schema, defaultValues);
	const [values, setValues] =
		React.useState<Record<string, unknown>>(initialValues);

	const location = useLocation();
	const locationKey = `${location.pathname}${location.search}`;
	const previousLocationKey = React.useRef(locationKey);

	// Reset form when URL changes (handles edit → new transitions)
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on URL change only, using current schema/defaultValues from closure
	React.useEffect(() => {
		if (previousLocationKey.current === locationKey) return;
		previousLocationKey.current = locationKey;

		const newInitialValues = buildInitialValues(schema, defaultValues);
		setValues(newInitialValues);
		setClientErrors({});
		setHasSubmitted(false);
		setFallbackError(null);
	}, [locationKey]);

	const latestActionData = React.useRef(fetcher.data);
	if (fetcher.data !== latestActionData.current) {
		latestActionData.current = fetcher.data;
		setVisibleServerErrors(fetcher.data?.fieldErrors ?? {});
	}

	React.useLayoutEffect(() => {
		const serverFieldErrors = fetcher.data?.fieldErrors ?? {};
		for (const [fieldName, errorMessage] of Object.entries(serverFieldErrors)) {
			const errorElement = document.getElementById(errorMessageId(fieldName));
			if (!errorElement) {
				setFallbackError(`${t(errorMessage as never)} (${fieldName})`);
				return;
			}
		}
		setFallbackError(null);
	}, [fetcher.data, t]);

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
		if (name.includes(".") || name.includes("[")) {
			setValues((prev) => setNestedValue(prev, name, newValue));
		} else {
			setValues((prev) => ({ ...prev, [name]: newValue }));
		}
	};

	const setValueFromPrev = (
		name: string,
		updater: (prev: unknown) => unknown,
	) => {
		setValues((prevValues) => {
			const prevValue = prevValues[name];
			const newValue = updater(prevValue);
			return { ...prevValues, [name]: newValue };
		});
	};

	const validateAndPrepare = (): boolean => {
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
				const fieldName = buildFieldPath(issue.path);
				if (fieldName && !newErrors[fieldName]) {
					const value = getNestedValue(values, fieldName);
					const properError = validateField(schema, fieldName, value);
					newErrors[fieldName] = properError ?? issue.message;
				}
			}
		}

		if (Object.keys(newErrors).length > 0) {
			flushSync(() => {
				setClientErrors(newErrors);
			});
			scrollToFirstError(newErrors);
			return false;
		}

		return true;
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!validateAndPrepare()) return;

		if (onApply) {
			onApply(values as z.infer<z.ZodObject<T>>);
		} else {
			fetcher.submit(values as Record<string, string>, {
				method,
				action,
				encType: "application/json",
			});
		}
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
				const fieldName = buildFieldPath(issue.path);
				if (fieldName && !newErrors[fieldName]) {
					const value = getNestedValue(updatedValues, fieldName);
					const properError = validateField(schema, fieldName, value);
					newErrors[fieldName] = properError ?? issue.message;
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

	const submitToServer = (valuesToSubmit: Record<string, unknown>) => {
		if (!validateAndPrepare()) return;

		if (onApply) {
			onApply(values as z.infer<z.ZodObject<T>>);
		}

		fetcher.submit(valuesToSubmit as Record<string, string>, {
			method,
			action,
			encType: "application/json",
		});
	};

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
		setValueFromPrev,
		submitToServer,
		fetcherState: fetcher.state,
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
		typeof children === "function"
			? children({
					names,
					FormField: FormFieldComponent as TypedFormFieldComponent<T>,
				})
			: children;

	return (
		<FormContext.Provider value={contextValue as FormContextValue}>
			<form
				method={method}
				action={action}
				className={className ?? styles.form}
				onSubmit={handleSubmit}
			>
				{title ? <h2 className={styles.title}>{title}</h2> : null}
				<React.Fragment key={locationKey}>{resolvedChildren}</React.Fragment>
				{autoSubmit ? null : (
					<div className="mt-4 stack horizontal md mx-auto justify-center">
						<SubmitButton
							_action={_action}
							testId={submitButtonTestId}
							state={fetcher.state}
						>
							{submitButtonText ?? t("submit")}
						</SubmitButton>
						{secondarySubmit}
					</div>
				)}
				{fallbackError ? (
					<div className="mt-4 mx-auto" data-testid="fallback-form-error">
						<FormMessage type="error">{fallbackError}</FormMessage>
					</div>
				) : null}
			</form>
		</FormContext.Provider>
	);
}

function buildFieldPath(path: PropertyKey[]): string | null {
	if (path.length === 0) return null;

	return path
		.map((segment, index) => {
			if (typeof segment === "number") return `[${segment}]`;
			if (typeof segment === "symbol") return null;
			return index === 0 ? segment : `.${segment}`;
		})
		.filter((part) => part !== null)
		.join("");
}

function buildInitialValues<T extends z.ZodRawShape>(
	schema: z.ZodObject<T>,
	defaultValues?: Partial<z.input<z.ZodObject<T>>> | null,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [key, fieldSchema] of Object.entries(schema.shape)) {
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
