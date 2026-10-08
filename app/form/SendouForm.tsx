import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import * as React from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import type { FetcherWithComponents } from "react-router";
import { useFetcher, useLocation } from "react-router";
import { isPlainObject } from "remeda";
import * as v from "valibot";
import {
	SendouButton,
	type SendouButtonProps,
} from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { SubmitButton } from "~/components/SubmitButton";
import { holdRevalidationsDuring } from "~/features/chat/revalidation-scope";
import { useSearchParam } from "~/modules/search-params/hooks";
import * as SearchParams from "~/modules/search-params/search-params";
import { FormField as FormFieldComponent } from "./FormField";
import { getFormFieldMetadata } from "./fields";
import { formSearchParams } from "./form-search-params";
import styles from "./SendouForm.module.css";
import type {
	FormObjectSchema,
	FormStepDefinition,
	TypedFormFieldComponent,
} from "./types";
import {
	type UnsavedChangesChecker,
	useUnsavedChangesChecker,
} from "./UnsavedChangesGuard";
import {
	buildFieldPath,
	errorMessageId,
	getNestedValue,
	issuePathKeys,
	RENDERS_FIELD_ERRORS_KEY,
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

/** Values and client errors live outside React state; fields subscribe to their own slice via `useSyncExternalStore`. */
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

type FieldRevealer = (fieldName: string) => void;

type FormFieldContextValue = Omit<
	FormContextValue,
	"values" | "clientErrors"
> & {
	store: FormStore;
	steps: ReadonlyArray<FormStepDefinition> | undefined;
	currentStepIdx: number;
	goToStep: (stepIdx: number) => void;
	registerFieldRevealer: (revealer: FieldRevealer) => () => void;
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
	/** Replaces the default layout classes entirely, so `fullWidth` has no effect when set. */
	className?: string;
	/** Opts out of the default centered max-width layout to fill the parent. */
	fullWidth?: boolean;
	/** Every field disabled and the submit button hidden. */
	readOnly?: boolean;
	secondarySubmit?: React.ReactNode;
	/** Hides the submit button while the values match, for branches with nothing to submit. */
	hideSubmitButtonWhen?: (
		values: Partial<v.InferInput<v.ObjectSchema<T, undefined>>>,
	) => boolean;
	/** Called once after the action returns without field errors. */
	onSuccess?: () => void;
	/**
	 * Splits the form into steps shown one at a time, each rendered by a `<FormStep>` of the same name.
	 * Moving forward validates the fields of the steps passed. The current step is kept in the `step` search param.
	 */
	steps?: ReadonlyArray<FormStepDefinition<keyof T & string>>;
	/** Shows the submit button on every step, not only the last, e.g. when editing something already valid. */
	submitOnEveryStep?: boolean;
};

/**
 * `"submit"` (default): submit button sends values to the server, or to `onApply` when provided.
 * `"autoSubmit"`: no button; every valid change is sent to the server.
 * `"client"`: no button or `<form>`; every change goes to `onApply` and errors are computed on mount.
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
	steps: ReadonlyArray<FormStepDefinition> | undefined;
	currentStepIdx: number;
	pushStepToUrl: (stepIdx: number) => void;
}

export function SendouForm<T extends v.ObjectEntries>(
	props: SendouFormProps<T>,
) {
	// remount on URL change resets form state (edit → new transitions)
	const location = useLocation();
	const searchWithoutStep = SearchParams.omitFromSearch(
		formSearchParams.keys,
		location.search,
	);

	return (
		<SendouFormInner
			key={`${location.pathname}?${searchWithoutStep}`}
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
	steps,
	submitOnEveryStep = false,
}: SendouFormProps<T>) {
	const { t } = useTranslation(["forms"]);
	const fetcher = useFetcher<{ fieldErrors?: Record<string, string> }>();
	const [hasSubmitted, setHasSubmitted] = React.useState(false);
	const [visibleServerErrors, setVisibleServerErrors] = React.useState<
		Partial<Record<string, string>>
	>(fetcher.data?.fieldErrors ?? {});
	const [fallbackError, setFallbackError] = React.useState<string | null>(null);
	const [stepInUrl, setStepInUrl] = useSearchParam(formSearchParams, "step");
	const stepIdxInUrl = stepIdxByName(steps, stepInUrl);
	const [currentStepIdx, setCurrentStepIdx] = React.useState(stepIdxInUrl);
	// browser back/forward changes the step in the URL
	const [syncedStepIdxInUrl, setSyncedStepIdxInUrl] =
		React.useState(stepIdxInUrl);
	if (stepIdxInUrl !== syncedStepIdxInUrl) {
		setSyncedStepIdxInUrl(stepIdxInUrl);
		setCurrentStepIdx(stepIdxInUrl);
	}
	const isOnLastStep = steps ? currentStepIdx === steps.length - 1 : false;
	const [hasReachedLastStep, setHasReachedLastStep] =
		React.useState(isOnLastStep);
	if (isOnLastStep && !hasReachedLastStep) {
		setHasReachedLastStep(true);
	}
	const formRef = React.useRef<HTMLElement | null>(null);

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
		steps,
		currentStepIdx,
		// in a microtask: the navigation's transition, if started within the submit event, makes React treat the form as running an action
		pushStepToUrl: (stepIdx) =>
			queueMicrotask(() =>
				setStepInUrl(stepIdx === 0 ? null : (steps?.[stepIdx]?.name ?? null), {
					// a navigation, not a replace, so browser back goes to the previous step
					loader: true,
					replace: false,
				}),
			),
	};
	const latest = React.useRef(latestProps);
	latest.current = latestProps;

	const [actions] = React.useState(() =>
		createFormActions({
			store,
			latest,
			formRef,
			setHasSubmitted,
			setVisibleServerErrors,
			setFallbackError,
			setCurrentStepIdx,
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

		// revealing the field (e.g. switching to its step) updates state, which can't be flushed mid-commit
		queueMicrotask(() => actions.focusServerErrors(errorEntries));
	}, [fetcher.data, actions]);

	const hasUnsavedChangesRef = React.useRef<UnsavedChangesChecker>(() => false);
	hasUnsavedChangesRef.current = (navigation) =>
		mode === "submit" &&
		!readOnly &&
		store.dirty &&
		fetcher.state === "idle" &&
		!(navigation && isStepChangeOnly(navigation));
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
			steps: steps as ReadonlyArray<FormStepDefinition> | undefined,
			currentStepIdx,
			goToStep: actions.goToStep,
			registerFieldRevealer: actions.registerFieldRevealer,
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
			steps,
			currentStepIdx,
		],
	);

	const resolvedChildren =
		typeof children === "function"
			? children({
					FormField: FormFieldComponent as TypedFormFieldComponent<T>,
				})
			: children;

	const submitButton = (
		<SubmitButton
			testId={submitButtonTestId}
			state={fetcher.state}
			data-form-submit=""
			variant={submitButtonVariant}
			size={submitButtonSize}
		>
			{submitButtonText ?? t("submit")}
		</SubmitButton>
	);

	const formContent = (
		<>
			{title ? <h2 className={styles.title}>{title}</h2> : null}
			{steps ? <FormStepper /> : null}
			{resolvedChildren}
			{steps ? (
				<FormStepFooter
					submitButton={readOnly ? null : submitButton}
					secondarySubmit={secondarySubmit}
					isSubmitShownOnEveryStep={submitOnEveryStep || hasReachedLastStep}
				/>
			) : mode !== "submit" || readOnly ? null : (
				<SubmitRow
					hideWhen={
						hideSubmitButtonWhen as ((values: unknown) => boolean) | undefined
					}
				>
					{submitButton}
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
					ref={(element) => {
						formRef.current = element;
					}}
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

/** Split out of {@link SubmitRow} so only forms that opt in subscribe to the values (re-rendering on every edit). */
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

/** One step of a multi-step form (see the `steps` prop of `SendouForm`). Kept mounted while hidden so its fields keep their local state. */
export function FormStep({
	name,
	children,
}: {
	name: string;
	children: React.ReactNode;
}) {
	const context = React.useContext(FormContext);
	const isCurrent = context?.steps?.[context.currentStepIdx]?.name === name;

	return (
		<div className={styles.step} hidden={!isCurrent} data-form-step={name}>
			{children}
		</div>
	);
}

/** Steps of the surrounding multi-step `SendouForm`. `goToStep` validates the steps passed when moving forward. */
export function useFormSteps() {
	const context = React.useContext(FormContext);
	if (!context?.steps) {
		throw new Error("useFormSteps must be used within a SendouForm with steps");
	}

	const { steps, currentStepIdx, goToStep } = context;

	return {
		steps,
		currentStep: steps[currentStepIdx],
		goToStep: (stepName: string) =>
			goToStep(steps.findIndex((step) => step.name === stepName)),
	};
}

/**
 * Lets a custom field show the part of itself rendering a nested field (e.g. by selecting an item) before
 * the form focuses that field's error. Called with the field name, e.g. `brackets[2].name`.
 */
export function useFieldRevealer(reveal: (fieldName: string) => void) {
	const context = React.useContext(FormContext);
	const latestReveal = React.useRef(reveal);
	latestReveal.current = reveal;

	const register = context?.registerFieldRevealer;
	React.useEffect(
		() => register?.((fieldName) => latestReveal.current(fieldName)),
		[register],
	);
}

function FormStepper() {
	const { t } = useTranslation(["forms"]);
	const context = React.useContext(FormContext);
	const store = context?.store ?? EMPTY_FORM_STORE;
	const getClientErrors = () => store.clientErrors;
	const clientErrors = React.useSyncExternalStore(
		store.subscribe,
		getClientErrors,
		getClientErrors,
	);

	if (!context?.steps) return null;
	const { steps, currentStepIdx, goToStep, serverErrors } = context;

	const erroredStepIdxs = new Set(
		[...Object.keys(clientErrors), ...Object.keys(serverErrors)].map(
			(fieldName) => stepIdxOfField(steps, fieldName),
		),
	);

	return (
		<ol className={styles.stepper}>
			{steps.map((step, stepIdx) => {
				const isCurrent = stepIdx === currentStepIdx;
				const hasErrors = erroredStepIdxs.has(stepIdx);
				const isDone = stepIdx < currentStepIdx && !hasErrors;

				return (
					<li
						key={step.name}
						className={clsx(styles.stepperItem, {
							[styles.stepperItemCurrent]: isCurrent,
						})}
					>
						<button
							type="button"
							className={clsx(styles.stepperButton, {
								[styles.stepperButtonCurrent]: isCurrent,
								[styles.stepperButtonError]: hasErrors,
							})}
							aria-current={isCurrent ? "step" : undefined}
							onClick={() => goToStep(stepIdx)}
							data-testid={`form-step-button-${step.name}`}
						>
							<span className={styles.stepperNumber} aria-hidden="true">
								{hasErrors ? "!" : isDone ? <Check size={14} /> : stepIdx + 1}
							</span>
							<span className={styles.stepperLabel}>{t(step.label)}</span>
						</button>
					</li>
				);
			})}
		</ol>
	);
}

function FormStepFooter({
	submitButton,
	secondarySubmit,
	isSubmitShownOnEveryStep,
}: {
	submitButton: React.ReactNode;
	secondarySubmit: React.ReactNode;
	isSubmitShownOnEveryStep: boolean;
}) {
	const { t } = useTranslation(["forms", "common"]);
	const context = React.useContext(FormContext);
	if (!context?.steps) return null;

	const { steps, currentStepIdx, goToStep } = context;
	const isLastStep = currentStepIdx === steps.length - 1;

	return (
		<div className={styles.stepFooter}>
			{currentStepIdx > 0 ? (
				<SendouButton
					variant="outlined"
					icon={<ArrowLeft />}
					onClick={() => goToStep(currentStepIdx - 1)}
				>
					{t("common:actions.back")}
				</SendouButton>
			) : null}
			<span className={styles.stepFooterProgress}>
				{t("forms:steps.progress", {
					current: currentStepIdx + 1,
					total: steps.length,
					step: t(steps[currentStepIdx].label),
				})}
			</span>
			{isLastStep ? null : (
				// a submit button so pressing enter in a field moves on, see `handleSubmit`
				<SendouButton
					type="submit"
					variant={isSubmitShownOnEveryStep ? "outlined" : undefined}
					icon={<ArrowRight />}
					testId="form-next-step-button"
				>
					{t("common:actions.next")}
				</SendouButton>
			)}
			{isLastStep || isSubmitShownOnEveryStep ? (
				<>
					{submitButton}
					{secondarySubmit}
				</>
			) : null}
		</div>
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
	formRef: React.RefObject<HTMLElement | null>;
	setHasSubmitted: React.Dispatch<React.SetStateAction<boolean>>;
	setVisibleServerErrors: React.Dispatch<
		React.SetStateAction<Partial<Record<string, string>>>
	>;
	setFallbackError: React.Dispatch<React.SetStateAction<string | null>>;
	setCurrentStepIdx: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Created once per form instance, reading current values/props through the store and `latest` ref,
 * so the form context stays referentially stable and fields skip re-rendering on unrelated changes.
 */
function createFormActions({
	store,
	latest,
	formRef,
	setHasSubmitted,
	setVisibleServerErrors,
	setFallbackError,
	setCurrentStepIdx,
}: FormActionDeps) {
	// steps the user has tried to leave (or submitted), only their errors are shown so later steps don't greet the user with errors
	const validatedStepIdxs = new Set<number>();
	const fieldRevealers = new Set<FieldRevealer>();

	const registerFieldRevealer = (revealer: FieldRevealer) => {
		fieldRevealers.add(revealer);
		return () => {
			fieldRevealers.delete(revealer);
		};
	};

	registerFieldRevealer((fieldName) => {
		const stepIdx = stepIdxOfField(latest.current.steps, fieldName);
		if (stepIdx === -1) return;

		setCurrentStepIdx(stepIdx);
		latest.current.pushStepToUrl(stepIdx);
	});

	const revealField = (fieldName: string) => {
		flushSync(() => {
			for (const reveal of fieldRevealers) {
				reveal(fieldName);
			}
		});
	};

	const errorsOfValidatedSteps = (errors: Record<string, string>) => {
		const { steps } = latest.current;
		if (!steps) return errors;

		const allStepsValidated = validatedStepIdxs.size === steps.length;
		const result: Record<string, string> = {};
		for (const [fieldName, error] of Object.entries(errors)) {
			const stepIdx = stepIdxOfField(steps, fieldName);
			const isShown =
				stepIdx === -1 ? allStepsValidated : validatedStepIdxs.has(stepIdx);
			if (isShown) result[fieldName] = error;
		}
		return result;
	};

	const changeStep = (stepIdx: number) => {
		flushSync(() => setCurrentStepIdx(stepIdx));
		latest.current.pushStepToUrl(stepIdx);

		const form = formRef.current;
		if (form && form.getBoundingClientRect().top < 0) {
			form.scrollIntoView({ block: "start" });
		}
	};

	const goToStep = (targetIdx: number) => {
		const { steps, currentStepIdx, schema } = latest.current;
		if (!steps || targetIdx === currentStepIdx) return;
		if (targetIdx < 0 || targetIdx >= steps.length) return;

		if (targetIdx < currentStepIdx) {
			changeStep(targetIdx);
			return;
		}

		const errors = computeFieldErrors(schema, store.values);
		for (let stepIdx = currentStepIdx; stepIdx < targetIdx; stepIdx++) {
			validatedStepIdxs.add(stepIdx);

			const stepErrors = Object.fromEntries(
				Object.entries(errors).filter(
					([fieldName]) => stepIdxOfField(steps, fieldName) === stepIdx,
				),
			);
			if (Object.keys(stepErrors).length > 0) {
				setHasSubmitted(true);
				flushSync(() => {
					store.setClientErrors(errorsOfValidatedSteps(errors));
				});
				scrollToFirstError(stepErrors);
				return;
			}
		}

		store.setClientErrors(errorsOfValidatedSteps(errors));
		changeStep(targetIdx);
	};

	const scrollToFirstError = (errors: Record<string, string>) => {
		const errorFieldNames = Object.keys(errors);
		if (errorFieldNames.length === 0) return;

		revealField(firstErrorFieldName(latest.current, errorFieldNames));

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

	const focusServerErrors = (errorEntries: Array<[string, string]>) => {
		const errorFieldNames = errorEntries.map(([fieldName]) => fieldName);
		revealField(firstErrorFieldName(latest.current, errorFieldNames));

		for (const [fieldName, errorMessage] of errorEntries) {
			const errorElement = document.getElementById(errorMessageId(fieldName));
			if (!errorElement) {
				setFallbackError(`${latest.current.t(errorMessage)} (${fieldName})`);
				return;
			}
		}

		setFallbackError(null);

		const firstError = findFirstErrorElementInDomOrder(errorFieldNames);
		if (firstError) focusAndScrollToError(firstError);
	};

	const validateAndPrepare = (): boolean => {
		setHasSubmitted(true);
		setVisibleServerErrors({});

		for (const stepIdx of (latest.current.steps ?? []).keys()) {
			validatedStepIdxs.add(stepIdx);
		}

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
		const submitted = {
			...values,
			[RENDERS_FIELD_ERRORS_KEY]: true,
			...(revalidateRoot ? { revalidateRoot: true } : {}),
		};
		void holdRevalidationsDuring(() =>
			fetcher.submit(submitted as unknown as Record<string, string>, {
				method: "post",
				action,
				encType: "application/json",
			}),
		);
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

	// server errors are keyed by positional path (e.g. `members[2].userId`); an edit makes the verdict for
	// that field and its descendants stale, otherwise re-adding an array item at the same index would
	// resurrect the previous item's error
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
			errorsOfValidatedSteps(
				computeFieldErrors(latest.current.schema, updatedValues),
			),
		);
	};

	const submitToServer = (valuesToSubmit: Record<string, unknown>) => {
		if (!validateAndPrepare()) return;

		// before `onApply` since it may navigate synchronously (e.g. calendar filters) and the blocker
		// would still see the form as dirty
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

		// pressing enter in a text input submits implicitly, before the last step that means moving on
		const { steps, currentStepIdx } = latest.current;
		const submitter = (e.nativeEvent as SubmitEvent).submitter;
		const isSubmitButtonPressed =
			submitter instanceof HTMLElement &&
			submitter.dataset.formSubmit !== undefined;
		if (steps && currentStepIdx < steps.length - 1 && !isSubmitButtonPressed) {
			goToStep(currentStepIdx + 1);
			return;
		}

		if (!validateAndPrepare()) return;

		const { onApply } = latest.current;
		if (onApply) {
			// see the same note in autoSubmit above
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
		goToStep,
		registerFieldRevealer,
		focusServerErrors,
	};
}

function stepIdxByName(
	steps: ReadonlyArray<FormStepDefinition> | undefined,
	stepName: string | null,
) {
	return Math.max(steps?.findIndex((step) => step.name === stepName) ?? 0, 0);
}

function isStepChangeOnly({
	currentLocation,
	nextLocation,
}: NonNullable<Parameters<UnsavedChangesChecker>[0]>) {
	return (
		currentLocation.pathname === nextLocation.pathname &&
		SearchParams.omitFromSearch(
			formSearchParams.keys,
			currentLocation.search,
		) ===
			SearchParams.omitFromSearch(formSearchParams.keys, nextLocation.search)
	);
}

/** Index of the step rendering the field (a top-level or nested name like `brackets[0].name`), -1 if none does. */
function stepIdxOfField(
	steps: ReadonlyArray<FormStepDefinition> | undefined,
	fieldName: string,
) {
	if (!steps) return -1;

	const topLevelKey = fieldName.split(/[.[]/)[0];
	return steps.findIndex((step) => step.fields.includes(topLevelKey));
}

/** The error to bring into view: of the earliest step, then by schema order. Field order on the page is only known once rendered. */
function firstErrorFieldName(
	{ steps, schema }: Pick<LatestFormProps, "steps" | "schema">,
	errorFieldNames: string[],
) {
	const schemaKeys = Object.keys(schema.entries);
	const rank = (fieldName: string) => {
		const stepIdx = stepIdxOfField(steps, fieldName);
		return [
			stepIdx === -1 ? Number.POSITIVE_INFINITY : stepIdx,
			schemaKeys.indexOf(fieldName.split(/[.[]/)[0]),
		] as const;
	};

	return errorFieldNames.toSorted((a, b) => {
		const [stepA, keyA] = rank(a);
		const [stepB, keyB] = rank(b);
		return stepA - stepB || keyA - keyB;
	})[0];
}

/**
 * One full-schema parse; each issue is keyed both by its top-level field (single-control composites
 * like weapon-pool read errors by their own name) and its full nested path (array/fieldset children).
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
				// only fieldset items get a `_key`; spreading would collapse e.g. `Date` into `{}`
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

/** Subscribes to one value by path (e.g. `"matches[2].mode"`), re-rendering only when it changes, unlike `useFormFieldContext`. */
export function useFormValue(name: string): unknown {
	const context = React.useContext(FormContext);
	const store = context?.store ?? EMPTY_FORM_STORE;

	const getValue = () => getNestedValue(store.values, name);
	return React.useSyncExternalStore(store.subscribe, getValue, getValue);
}

/** DOM order, not error-map order: schema order need not match rendered order. */
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

/** Focuses the control referencing the error via `aria-errormessage`, else any focusable in the wrapper, else the message itself. */
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
