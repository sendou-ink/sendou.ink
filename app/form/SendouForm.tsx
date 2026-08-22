import clsx from "clsx";
import * as React from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { FetcherWithComponents } from "react-router";
import { useFetcher, useLocation } from "react-router";
import { isPlainObject } from "remeda";
import * as v from "valibot";
import type { SendouButtonProps } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { SubmitButton } from "~/components/SubmitButton";
import { FormField as FormFieldComponent } from "./FormField";
import { getFormFieldMetadata } from "./fields";
import styles from "./SendouForm.module.css";
import type { FormObjectSchema, TypedFormFieldComponent } from "./types";
import { useUnsavedChangesChecker } from "./UnsavedChangesGuard";
import {
	buildFieldPath,
	errorMessageId,
	getNestedValue,
	issuePathKeys,
	seedArrayItemDefaults,
	setNestedValue,
	validateField,
} from "./utils";

type RequiredDefaultKeys<T extends v.ObjectEntries> = {
	[K in keyof T & string]: T[K] extends { _requiresDefault: true } ? K : never;
}[keyof T & string];

type HasRequiredDefaults<T extends v.ObjectEntries> =
	RequiredDefaultKeys<T> extends never ? false : true;

export interface FormContextValue<T extends v.ObjectEntries = v.ObjectEntries> {
	schema: FormObjectSchema<T>;
	defaultValues?: Partial<v.InferInput<v.ObjectSchema<T, undefined>>> | null;
	serverErrors: Partial<
		Record<keyof v.InferOutput<v.ObjectSchema<T, undefined>>, string>
	>;
	clientErrors: Partial<Record<string, string>>;
	hasSubmitted: boolean;
	setClientError: (name: string, error: string | undefined) => void;
	clearServerError: (name: string) => void;
	onFieldChange?: (name: string, newValue: unknown) => void;
	readOnly: boolean;
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
	/** Has the user edited any field since mount / the last successful submit? */
	dirty: boolean;
	subscribe: (listener: () => void) => () => void;
	setValues: (values: Record<string, unknown>) => void;
	setClientErrors: (errors: Partial<Record<string, string>>) => void;
	setDirty: (dirty: boolean) => void;
}

type FormFieldContextValue = Omit<
	FormContextValue,
	"values" | "clientErrors"
> & {
	store: FormStore;
};

const FormContext = React.createContext<FormFieldContextValue | null>(null);

export const EMPTY_FORM_STORE = createFormStore({}, {});

const SUBMIT_ROW_CLASS_NAME =
	"mt-4 stack horizontal md mx-auto justify-center items-center";

export interface FormRenderProps<T extends v.ObjectEntries> {
	FormField: TypedFormFieldComponent<T>;
}

export type FormMode = "submit" | "autoSubmit" | "client";

type BaseFormProps<T extends v.ObjectEntries> = {
	children: React.ReactNode | ((props: FormRenderProps<T>) => React.ReactNode);
	schema: FormObjectSchema<T>;
	title?: React.ReactNode;
	submitButtonText?: React.ReactNode;
	action?: string;
	submitButtonTestId?: string;
	/** Styling of the submit button, for forms embedded somewhere the default button is too heavy. */
	submitButtonVariant?: SendouButtonProps["variant"];
	submitButtonSize?: SendouButtonProps["size"];
	revalidateRoot?: boolean;
	/**
	 * Replaces the default form layout classes entirely (it does not merge with
	 * them), so `fullWidth` has no effect when this is set.
	 */
	className?: string;
	/**
	 * When true, opts out of the default centered, max-width layout so the form
	 * expands to fill its parent container. Use when embedding a form inside a
	 * layout that already controls width/alignment.
	 */
	fullWidth?: boolean;
	/**
	 * When true, renders the form for viewing only: every field is disabled and
	 * the submit button is hidden.
	 */
	readOnly?: boolean;
	secondarySubmit?: React.ReactNode;
	/**
	 * Hides the submit button while the current values match, for forms with a
	 * branch that has nothing to submit (e.g. a choice that only shows guidance).
	 */
	hideSubmitButtonWhen?: (
		values: Partial<v.InferInput<v.ObjectSchema<T, undefined>>>,
	) => boolean;
	/**
	 * Called once after a server submission completes successfully (the action
	 * returned without field errors). Useful for collapsing an inline edit form
	 * back to a read-only view.
	 */
	onSuccess?: () => void;
};

/**
 * How submitting works:
 * - `"submit"` (default): the user submits via the submit button. Values go to
 *   the server, or to `onApply` when provided.
 * - `"autoSubmit"`: no submit button; every change that passes validation is
 *   sent to the server.
 * - `"client"`: no submit button and no `<form>` element; every change is
 *   passed to `onApply` and field errors are computed already on mount.
 */
type FormModeProps<T extends v.ObjectEntries> =
	| {
			mode?: "submit";
			/** When set, a valid submit is handed to this callback instead of being sent to the server. */
			onApply?: (values: v.InferOutput<v.ObjectSchema<T, undefined>>) => void;
	  }
	| { mode: "autoSubmit"; onApply?: never }
	| {
			mode: "client";
			onApply: (values: v.InferOutput<v.ObjectSchema<T, undefined>>) => void;
	  };

export type FormDefaultValues<T extends v.ObjectEntries> = Partial<
	v.InferInput<v.ObjectSchema<T, undefined>>
>;

type SendouFormProps<T extends v.ObjectEntries> = BaseFormProps<T> &
	FormModeProps<T> &
	(HasRequiredDefaults<T> extends true
		? {
				defaultValues: FormDefaultValues<T> &
					Record<RequiredDefaultKeys<T>, unknown>;
			}
		: { defaultValues?: FormDefaultValues<T> | null });

interface LatestFormProps {
	schema: FormObjectSchema;
	onApply: ((values: Record<string, unknown>) => void) | undefined;
	action: string | undefined;
	revalidateRoot: boolean | undefined;
	mode: FormMode;
	fetcher: FetcherWithComponents<{ fieldErrors?: Record<string, string> }>;
	t: (key: string) => string;
}

export function SendouForm<T extends v.ObjectEntries>(
	props: SendouFormProps<T>,
) {
	// Remounting on URL change resets all form state (handles edit → new transitions)
	const location = useLocation();

	return (
		<SendouFormInner
			key={`${location.pathname}${location.search}`}
			{...props}
		/>
	);
}

function SendouFormInner<T extends v.ObjectEntries>({
	children,
	schema,
	defaultValues,
	title,
	submitButtonText,
	action,
	submitButtonTestId,
	submitButtonVariant,
	submitButtonSize,
	revalidateRoot,
	className,
	fullWidth,
	readOnly = false,
	mode = "submit",
	onApply,
	secondarySubmit,
	hideSubmitButtonWhen,
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
			mode === "client"
				? computeTopLevelFieldErrors(schema, initialValues)
				: {},
		);
	}
	const store = storeRef.current;

	const latestProps: LatestFormProps = {
		schema: schema as FormObjectSchema,
		onApply: onApply as unknown as LatestFormProps["onApply"],
		action,
		revalidateRoot,
		mode,
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

		const firstError = findFirstErrorElementInDomOrder(
			errorEntries.map(([fieldName]) => fieldName),
		);
		if (firstError) focusAndScrollToError(firstError);
	}, [fetcher.data, t]);

	const hasUnsavedChangesRef = React.useRef<() => boolean>(() => false);
	hasUnsavedChangesRef.current = () =>
		mode === "submit" && !readOnly && store.dirty && fetcher.state === "idle";
	useUnsavedChangesChecker(hasUnsavedChangesRef);

	const previousFetcherStateRef = React.useRef(fetcher.state);
	React.useEffect(() => {
		if (
			previousFetcherStateRef.current !== "idle" &&
			fetcher.state === "idle" &&
			!fetcher.data?.fieldErrors
		) {
			store.setDirty(false);
			onSuccess?.();
		}
		previousFetcherStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, onSuccess, store]);

	const contextValue = React.useMemo<FormFieldContextValue>(
		() => ({
			schema: schema as FormObjectSchema,
			defaultValues: defaultValues as FormFieldContextValue["defaultValues"],
			serverErrors: visibleServerErrors,
			hasSubmitted,
			setClientError: actions.setClientError,
			clearServerError: actions.clearServerError,
			onFieldChange: mode !== "submit" ? actions.onFieldChange : undefined,
			readOnly,
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
			mode,
			readOnly,
			fetcher.state,
			store,
			actions,
		],
	);

	const resolvedChildren =
		typeof children === "function"
			? children({
					FormField: FormFieldComponent as TypedFormFieldComponent<T>,
				})
			: children;

	const formContent = (
		<>
			{title ? <h2 className={styles.title}>{title}</h2> : null}
			{resolvedChildren}
			{mode !== "submit" || readOnly ? null : (
				<SubmitRow
					hideWhen={
						hideSubmitButtonWhen as ((values: unknown) => boolean) | undefined
					}
				>
					<SubmitButton
						testId={submitButtonTestId}
						state={fetcher.state}
						variant={submitButtonVariant}
						size={submitButtonSize}
					>
						{submitButtonText ?? t("submit")}
					</SubmitButton>
					{secondarySubmit}
				</SubmitRow>
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
			{mode === "client" ? (
				<div className={resolvedClassName}>{formContent}</div>
			) : (
				<form
					method="post"
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

function SubmitRow({
	hideWhen,
	children,
}: {
	hideWhen: ((values: unknown) => boolean) | undefined;
	children: React.ReactNode;
}) {
	return hideWhen ? (
		<ConditionalSubmitRow hideWhen={hideWhen}>{children}</ConditionalSubmitRow>
	) : (
		<div className={SUBMIT_ROW_CLASS_NAME}>{children}</div>
	);
}

/**
 * Split out of {@link SubmitRow} so that only forms that opt in subscribe to the
 * form's values (and re-render on every edit).
 */
function ConditionalSubmitRow({
	hideWhen,
	children,
}: {
	hideWhen: (values: unknown) => boolean;
	children: React.ReactNode;
}) {
	const context = React.useContext(FormContext);
	const store = context?.store ?? EMPTY_FORM_STORE;
	const getValues = () => store.values;
	const values = React.useSyncExternalStore(
		store.subscribe,
		getValues,
		getValues,
	);

	if (hideWhen(values)) return null;

	return <div className={SUBMIT_ROW_CLASS_NAME}>{children}</div>;
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
		dirty: false,
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
		// Read only at navigation time (unsaved-changes guard), so no notify.
		setDirty(dirty) {
			store.dirty = dirty;
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
		const errorFieldNames = Object.keys(errors);
		if (errorFieldNames.length === 0) return;

		const firstError = findFirstErrorElementInDomOrder(errorFieldNames);
		if (firstError) {
			focusAndScrollToError(firstError);
			setFallbackError(null);
		} else {
			const firstErrorField = errorFieldNames[0];
			const firstErrorMessage = errors[firstErrorField];
			setFallbackError(
				firstErrorMessage
					? `${latest.current.t(firstErrorMessage)} (${firstErrorField})`
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
		const { fetcher, action, revalidateRoot } = latest.current;
		const submitted = revalidateRoot
			? { ...values, revalidateRoot: true }
			: values;
		fetcher.submit(submitted as Record<string, string>, {
			method: "post",
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
		store.setDirty(true);
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
		store.setDirty(true);
		store.setValues({ ...store.values, [name]: updater(store.values[name]) });
	};

	const revalidateAll = (updatedValues: Record<string, unknown>) => {
		store.setClientErrors(
			computeFieldErrors(latest.current.schema, updatedValues),
		);
	};

	const submitToServer = (valuesToSubmit: Record<string, unknown>) => {
		if (!validateAndPrepare()) return;

		// Cleared before `onApply` because it may navigate synchronously (e.g.
		// calendar filters set search params) — the blocker would otherwise still
		// see the form as dirty and block that navigation.
		store.setDirty(false);
		latest.current.onApply?.(store.values);

		submitValues(valuesToSubmit);
	};

	const onFieldChange = (changedName: string, changedValue: unknown) => {
		const { schema, mode, onApply } = latest.current;
		const isNestedPath = changedName.includes(".") || changedName.includes("[");
		const updatedValues = isNestedPath
			? setNestedValue(store.values, changedName, changedValue)
			: { ...store.values, [changedName]: changedValue };

		const newErrors = computeTopLevelFieldErrors(schema, updatedValues);
		store.setClientErrors(newErrors);
		const hasFieldErrors = Object.keys(newErrors).length > 0;

		if (mode === "client") {
			onApply?.(updatedValues);
		} else if (mode === "autoSubmit" && !hasFieldErrors) {
			submitValues(updatedValues);
		}
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!validateAndPrepare()) return;

		const { onApply } = latest.current;
		if (onApply) {
			// Cleared before `onApply` because it may navigate synchronously (e.g.
			// calendar filters set search params) — the blocker would otherwise
			// still see the form as dirty and block that navigation.
			store.setDirty(false);
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
	schema: FormObjectSchema,
	values: Record<string, unknown>,
): Record<string, string> {
	const newErrors: Record<string, string> = {};

	const fullValidation = v.safeParse(schema, values);
	if (fullValidation.success) return newErrors;

	for (const issue of fullValidation.issues) {
		const issuePath = issuePathKeys(issue);
		const topLevelKey =
			typeof issuePath[0] === "string" ? issuePath[0] : undefined;
		if (topLevelKey && newErrors[topLevelKey] === undefined) {
			const topLevelError = validateField(
				schema,
				topLevelKey,
				values[topLevelKey],
			);
			if (topLevelError) newErrors[topLevelKey] = topLevelError;
		}

		const fieldName = buildFieldPath(issuePath);
		if (fieldName && newErrors[fieldName] === undefined) {
			const value = getNestedValue(values, fieldName);
			newErrors[fieldName] =
				validateField(schema, fieldName, value) ?? issue.message;
		}
	}

	return newErrors;
}

function computeTopLevelFieldErrors(
	schema: FormObjectSchema,
	values: Record<string, unknown>,
): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const key of Object.keys(schema.entries)) {
		const error = validateField(schema, key, values[key]);
		if (error) errors[key] = error;
	}
	return errors;
}

function buildInitialValues<T extends v.ObjectEntries>(
	schema: FormObjectSchema<T>,
	defaultValues?: Partial<v.InferInput<v.ObjectSchema<T, undefined>>> | null,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [key, fieldSchema] of Object.entries(schema.entries)) {
		const formField = getFormFieldMetadata(fieldSchema);

		const defaultValue = defaultValues?.[key as keyof typeof defaultValues];
		if (defaultValue !== undefined) {
			if (formField?.type === "array" && Array.isArray(defaultValue)) {
				// only object-array (fieldset) items get a stable `_key`; spreading would
				// collapse non-plain objects like `Date` into `{}`, so leave those intact
				result[key] = (defaultValue as unknown[]).map((item) =>
					isPlainObject(item)
						? {
								...item,
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
		readOnly: context.readOnly,
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

/**
 * Subscribes to a single form value by (possibly nested) path, e.g. `"type"`
 * or `"matches[2].mode"`. Unlike `useFormFieldContext` this re-renders only
 * when that value changes, so prefer it for reading form state in components
 * that should not re-render on every form edit.
 */
export function useFormValue(name: string): unknown {
	const context = React.useContext(FormContext);
	const store = context?.store ?? EMPTY_FORM_STORE;

	const getValue = () => getNestedValue(store.values, name);
	return React.useSyncExternalStore(store.subscribe, getValue, getValue);
}

/**
 * "First" error means first in DOM order, not first in error-map insertion
 * order — validation collects errors in schema order which does not have to
 * match the rendered field order.
 */
function findFirstErrorElementInDomOrder(errorFieldNames: string[]) {
	const errorElements = errorFieldNames.flatMap((name) => {
		const element = document.getElementById(errorMessageId(name));
		return element ? [{ name, element }] : [];
	});

	errorElements.sort((a, b) =>
		a.element.compareDocumentPosition(b.element) &
		Node.DOCUMENT_POSITION_FOLLOWING
			? -1
			: 1,
	);

	return errorElements.at(0);
}

/**
 * Moves focus to the failing field so keyboard and screen reader users are
 * taken to the problem, not just scrolled past it. Prefers the control that
 * references the error via `aria-errormessage`, then any focusable control in
 * the same wrapper, and as a last resort the error message element itself.
 */
function focusAndScrollToError({
	name,
	element,
}: {
	name: string;
	element: HTMLElement;
}) {
	const control = document.querySelector<HTMLElement>(
		`[aria-errormessage="${errorMessageId(name)}"]`,
	);
	const focusTarget =
		control ??
		element.parentElement?.querySelector<HTMLElement>(
			"input, select, textarea, button",
		) ??
		element;

	if (focusTarget === element) {
		element.setAttribute("tabindex", "-1");
	}
	focusTarget.focus({ preventScroll: true });
	element.scrollIntoView({ behavior: "smooth", block: "center" });
}
