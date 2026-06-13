import clsx from "clsx";
import * as React from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { FetcherWithComponents } from "react-router";
import { useFetcher, useLocation } from "react-router";
import type { z } from "zod";
import { FormMessage } from "~/components/FormMessage";
import { SubmitButton } from "~/components/SubmitButton";
import { FormField as FormFieldComponent } from "./FormField";
import { formRegistry } from "./fields";
import styles from "./SendouForm.module.css";
import type { FormField, TypedFormFieldComponent } from "./types";
import {
	buildFieldPath,
	errorMessageId,
	getNestedValue,
	seedArrayItemDefaults,
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
	clearServerError: (name: string) => void;
	onFieldChange?: (name: string, newValue: unknown) => void;
	values: Record<string, unknown>;
	setValue: (name: string, value: unknown) => void;
	setValueFromPrev: (name: string, updater: (prev: unknown) => unknown) => void;
	revalidateAll: (updatedValues: Record<string, unknown>) => void;
	submitToServer: (values: Record<string, unknown>) => void;
	fetcherState: "idle" | "loading" | "submitting";
}

/**
 * Holds the frequently-changing form state (values and client errors) outside
 * React state so that a change to one field does not re-render the whole form.
 * Fields subscribe to their own slice via `useSyncExternalStore` and only
 * re-render when that slice changes.
 */
interface FormStore {
	values: Record<string, unknown>;
	clientErrors: Partial<Record<string, string>>;
	subscribe: (listener: () => void) => () => void;
	setValues: (values: Record<string, unknown>) => void;
	setClientErrors: (errors: Partial<Record<string, string>>) => void;
}

type FormFieldContextValue = Omit<
	FormContextValue,
	"values" | "clientErrors"
> & {
	store: FormStore;
};

const FormContext = React.createContext<FormFieldContextValue | null>(null);

export const EMPTY_FORM_STORE = createFormStore({}, {});

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
	autoApply?: boolean;
	revalidateRoot?: boolean;
	className?: string;
	/**
	 * When true, opts out of the default centered, max-width layout so the form
	 * expands to fill its parent container. Use when embedding a form inside a
	 * layout that already controls width/alignment.
	 */
	fullWidth?: boolean;
	onApply?: (values: z.infer<z.ZodObject<T>>) => void;
	secondarySubmit?: React.ReactNode;
	/**
	 * Called once after a server submission completes successfully (the action
	 * returned without field errors). Useful for collapsing an inline edit form
	 * back to a read-only view.
	 */
	onSuccess?: () => void;
};

type SendouFormProps<T extends z.ZodRawShape> = BaseFormProps<T> &
	(HasRequiredDefaults<T> extends true
		? {
				defaultValues: Partial<z.input<z.ZodObject<T>>> &
					Record<RequiredDefaultKeys<T>, unknown>;
			}
		: { defaultValues?: Partial<z.input<z.ZodObject<T>>> | null });

interface LatestFormProps {
	schema: z.ZodObject<z.ZodRawShape>;
	onApply: ((values: Record<string, unknown>) => void) | undefined;
	method: "post" | "get";
	action: string | undefined;
	revalidateRoot: boolean | undefined;
	autoSubmit: boolean | undefined;
	autoApply: boolean | undefined;
	fetcher: FetcherWithComponents<{ fieldErrors?: Record<string, string> }>;
	t: (key: string) => string;
}

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
	autoApply,
	revalidateRoot,
	className,
	fullWidth,
	onApply,
	secondarySubmit,
	onSuccess,
}: SendouFormProps<T>) {
	const { t } = useTranslation(["forms"]);
	const fetcher = useFetcher<{ fieldErrors?: Record<string, string> }>();
	const [hasSubmitted, setHasSubmitted] = React.useState(false);
	const [visibleServerErrors, setVisibleServerErrors] = React.useState<
		Partial<Record<string, string>>
	>(fetcher.data?.fieldErrors ?? {});
	const [fallbackError, setFallbackError] = React.useState<string | null>(null);

	const storeRef = React.useRef<FormStore | null>(null);
	if (storeRef.current === null) {
		const initialValues = buildInitialValues(schema, defaultValues);
		storeRef.current = createFormStore(
			initialValues,
			autoApply ? computeTopLevelFieldErrors(schema, initialValues) : {},
		);
	}
	const store = storeRef.current;

	const latestProps: LatestFormProps = {
		schema: schema as z.ZodObject<z.ZodRawShape>,
		onApply: onApply as unknown as LatestFormProps["onApply"],
		method,
		action,
		revalidateRoot,
		autoSubmit,
		autoApply,
		fetcher,
		t: t as unknown as LatestFormProps["t"],
	};
	const latest = React.useRef(latestProps);
	latest.current = latestProps;

	const [actions] = React.useState(() =>
		createFormActions({
			store,
			latest,
			setHasSubmitted,
			setVisibleServerErrors,
			setFallbackError,
		}),
	);

	const location = useLocation();
	const locationKey = `${location.pathname}${location.search}`;
	const previousLocationKey = React.useRef(locationKey);

	// Reset form when URL changes (handles edit → new transitions)
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on URL change only, using current schema/defaultValues from closure
	React.useEffect(() => {
		if (previousLocationKey.current === locationKey) return;
		previousLocationKey.current = locationKey;

		store.setValues(buildInitialValues(schema, defaultValues));
		store.setClientErrors({});
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
		const errorEntries = Object.entries(serverFieldErrors);
		if (errorEntries.length === 0) {
			setFallbackError(null);
			return;
		}

		for (const [fieldName, errorMessage] of errorEntries) {
			const errorElement = document.getElementById(errorMessageId(fieldName));
			if (!errorElement) {
				setFallbackError(`${t(errorMessage as never)} (${fieldName})`);
				return;
			}
		}

		setFallbackError(null);

		const firstErrorField = errorEntries[0][0];
		const firstErrorElement = document.getElementById(
			errorMessageId(firstErrorField),
		);
		firstErrorElement?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, [fetcher.data, t]);

	const previousFetcherStateRef = React.useRef(fetcher.state);
	React.useEffect(() => {
		if (
			previousFetcherStateRef.current !== "idle" &&
			fetcher.state === "idle" &&
			!fetcher.data?.fieldErrors
		) {
			onSuccess?.();
		}
		previousFetcherStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, onSuccess]);

	const contextValue = React.useMemo<FormFieldContextValue>(
		() => ({
			schema: schema as z.ZodObject<z.ZodRawShape>,
			defaultValues: defaultValues as FormFieldContextValue["defaultValues"],
			serverErrors: visibleServerErrors,
			hasSubmitted,
			setClientError: actions.setClientError,
			clearServerError: actions.clearServerError,
			onFieldChange:
				autoSubmit || autoApply ? actions.onFieldChange : undefined,
			setValue: actions.setValue,
			setValueFromPrev: actions.setValueFromPrev,
			revalidateAll: actions.revalidateAll,
			submitToServer: actions.submitToServer,
			fetcherState: fetcher.state,
			store,
		}),
		[
			schema,
			defaultValues,
			visibleServerErrors,
			hasSubmitted,
			autoSubmit,
			autoApply,
			fetcher.state,
			store,
			actions,
		],
	);

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

	const formContent = (
		<>
			{title ? <h2 className={styles.title}>{title}</h2> : null}
			<React.Fragment key={locationKey}>{resolvedChildren}</React.Fragment>
			{autoSubmit || autoApply ? null : (
				<div className="mt-4 stack horizontal md mx-auto justify-center items-center">
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
		</>
	);

	const resolvedClassName =
		className ?? clsx(styles.form, { [styles.fullWidth]: fullWidth });

	return (
		<FormContext.Provider value={contextValue}>
			{autoApply && onApply ? (
				<div className={resolvedClassName}>{formContent}</div>
			) : (
				<form
					method={method}
					action={action}
					className={resolvedClassName}
					noValidate
					onSubmit={actions.handleSubmit}
				>
					{formContent}
				</form>
			)}
		</FormContext.Provider>
	);
}

function createFormStore(
	initialValues: Record<string, unknown>,
	initialClientErrors: Partial<Record<string, string>>,
): FormStore {
	const listeners = new Set<() => void>();
	const notify = () => {
		for (const listener of listeners) {
			listener();
		}
	};

	const store: FormStore = {
		values: initialValues,
		clientErrors: initialClientErrors,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		setValues(values) {
			store.values = values;
			notify();
		},
		setClientErrors(errors) {
			store.clientErrors = errors;
			notify();
		},
	};

	return store;
}

interface FormActionDeps {
	store: FormStore;
	latest: React.RefObject<LatestFormProps>;
	setHasSubmitted: React.Dispatch<React.SetStateAction<boolean>>;
	setVisibleServerErrors: React.Dispatch<
		React.SetStateAction<Partial<Record<string, string>>>
	>;
	setFallbackError: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Creates the form's action functions once per form instance. They read the
 * current values/props through the store and the `latest` ref, so their
 * identities stay stable across renders — this keeps the form context
 * referentially stable, which is what lets fields skip re-rendering when an
 * unrelated field changes.
 */
function createFormActions({
	store,
	latest,
	setHasSubmitted,
	setVisibleServerErrors,
	setFallbackError,
}: FormActionDeps) {
	const scrollToFirstError = (errors: Record<string, string>) => {
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
				firstError
					? `${latest.current.t(firstError)} (${firstErrorField})`
					: null,
			);
		}
	};

	const validateAndPrepare = (): boolean => {
		setHasSubmitted(true);
		setVisibleServerErrors({});

		const newErrors = computeFieldErrors(latest.current.schema, store.values);

		if (Object.keys(newErrors).length > 0) {
			flushSync(() => {
				store.setClientErrors(newErrors);
			});
			scrollToFirstError(newErrors);
			return false;
		}

		return true;
	};

	const submitValues = (values: Record<string, unknown>) => {
		const { fetcher, method, action, revalidateRoot } = latest.current;
		const submitted = revalidateRoot
			? { ...values, revalidateRoot: true }
			: values;
		fetcher.submit(submitted as Record<string, string>, {
			method,
			action,
			encType: "application/json",
		});
	};

	const setClientError = (name: string, error: string | undefined) => {
		if (error === undefined) {
			if (!(name in store.clientErrors)) return;
			const next = { ...store.clientErrors };
			delete next[name];
			store.setClientErrors(next);
			return;
		}
		store.setClientErrors({ ...store.clientErrors, [name]: error });
	};

	// Server errors are keyed by positional path (e.g. `members[2].userId`). When
	// the user edits a field, the server's verdict for that field — and for any
	// nested descendants when an array/object changes — is stale, so drop it.
	// Without this, removing an array item and re-adding one at the same index
	// would resurrect the previous item's server error.
	const clearServerError = (name: string) => {
		setVisibleServerErrors((prev) => {
			const isStale = (key: string) =>
				key === name ||
				key.startsWith(`${name}.`) ||
				key.startsWith(`${name}[`);
			if (!Object.keys(prev).some(isStale)) return prev;

			const next: Partial<Record<string, string>> = {};
			for (const [key, value] of Object.entries(prev)) {
				if (!isStale(key)) next[key] = value;
			}
			return next;
		});
	};

	const setValue = (name: string, newValue: unknown) => {
		if (name.includes(".") || name.includes("[")) {
			store.setValues(
				setNestedValue(
					seedArrayItemDefaults(latest.current.schema, store.values, name),
					name,
					newValue,
				),
			);
		} else {
			store.setValues({ ...store.values, [name]: newValue });
		}
	};

	const setValueFromPrev = (
		name: string,
		updater: (prev: unknown) => unknown,
	) => {
		store.setValues({ ...store.values, [name]: updater(store.values[name]) });
	};

	const revalidateAll = (updatedValues: Record<string, unknown>) => {
		store.setClientErrors(
			computeFieldErrors(latest.current.schema, updatedValues),
		);
	};

	const submitToServer = (valuesToSubmit: Record<string, unknown>) => {
		if (!validateAndPrepare()) return;

		latest.current.onApply?.(store.values);

		submitValues(valuesToSubmit);
	};

	const onFieldChange = (changedName: string, changedValue: unknown) => {
		const { schema, autoSubmit, autoApply, onApply } = latest.current;
		const isNestedPath = changedName.includes(".") || changedName.includes("[");
		const updatedValues = isNestedPath
			? setNestedValue(store.values, changedName, changedValue)
			: { ...store.values, [changedName]: changedValue };

		const newErrors = computeTopLevelFieldErrors(schema, updatedValues);
		store.setClientErrors(newErrors);
		const hasFieldErrors = Object.keys(newErrors).length > 0;

		if (autoApply && onApply) {
			onApply(updatedValues);
		} else if (autoSubmit && !hasFieldErrors) {
			submitValues(updatedValues);
		}
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!validateAndPrepare()) return;

		const { onApply } = latest.current;
		if (onApply) {
			onApply(store.values);
		} else {
			submitValues(store.values);
		}
	};

	return {
		setClientError,
		clearServerError,
		setValue,
		setValueFromPrev,
		revalidateAll,
		submitToServer,
		onFieldChange,
		handleSubmit,
	};
}

/**
 * Derives all client errors from a single full-schema parse. Each issue is
 * attributed both to its top-level field (single-control composites like
 * dual-select or weapon-pool read their error keyed by their own name even
 * when the issue points inside the value) and to its full nested path
 * (array/fieldset children render their own error slots).
 */
function computeFieldErrors(
	schema: z.ZodObject<z.ZodRawShape>,
	values: Record<string, unknown>,
): Record<string, string> {
	const newErrors: Record<string, string> = {};

	const fullValidation = schema.safeParse(values);
	if (fullValidation.success) return newErrors;

	for (const issue of fullValidation.error.issues) {
		const topLevelKey =
			typeof issue.path[0] === "string" ? issue.path[0] : undefined;
		if (topLevelKey && newErrors[topLevelKey] === undefined) {
			const topLevelError = validateField(
				schema,
				topLevelKey,
				values[topLevelKey],
			);
			if (topLevelError) newErrors[topLevelKey] = topLevelError;
		}

		const fieldName = buildFieldPath(issue.path);
		if (fieldName && newErrors[fieldName] === undefined) {
			const value = getNestedValue(values, fieldName);
			newErrors[fieldName] =
				validateField(schema, fieldName, value) ?? issue.message;
		}
	}

	return newErrors;
}

function computeTopLevelFieldErrors(
	schema: z.ZodObject<z.ZodRawShape>,
	values: Record<string, unknown>,
): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const key of Object.keys(schema.shape)) {
		const error = validateField(schema, key, values[key]);
		if (error) errors[key] = error;
	}
	return errors;
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

		const defaultValue = defaultValues?.[key as keyof typeof defaultValues];
		if (defaultValue !== undefined) {
			if (formField?.type === "array" && Array.isArray(defaultValue)) {
				result[key] = (defaultValue as unknown[]).map((item) =>
					typeof item === "object" && item !== null
						? {
								...(item as Record<string, unknown>),
								_key: crypto.randomUUID(),
							}
						: item,
				);
			} else {
				result[key] = defaultValue;
			}
		} else if (formField) {
			result[key] = formField.initialValue;
		}
	}

	return result;
}

export function useFormFieldContext(): FormContextValue {
	const context = React.useContext(FormContext);
	const store = context?.store ?? EMPTY_FORM_STORE;

	const getValues = () => store.values;
	const values = React.useSyncExternalStore(
		store.subscribe,
		getValues,
		getValues,
	);
	const getClientErrors = () => store.clientErrors;
	const clientErrors = React.useSyncExternalStore(
		store.subscribe,
		getClientErrors,
		getClientErrors,
	);

	if (!context) {
		throw new Error("useFormFieldContext must be used within a FormProvider");
	}

	return {
		schema: context.schema,
		defaultValues: context.defaultValues,
		serverErrors: context.serverErrors,
		clientErrors,
		hasSubmitted: context.hasSubmitted,
		setClientError: context.setClientError,
		clearServerError: context.clearServerError,
		onFieldChange: context.onFieldChange,
		values,
		setValue: context.setValue,
		setValueFromPrev: context.setValueFromPrev,
		revalidateAll: context.revalidateAll,
		submitToServer: context.submitToServer,
		fetcherState: context.fetcherState,
	};
}

export function useOptionalFormFieldContext() {
	return React.useContext(FormContext);
}
