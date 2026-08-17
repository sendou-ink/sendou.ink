<script lang="ts">
import { Button } from "@sendou/components";
import type { ComponentProps, Snippet } from "svelte";
import FormMessage from "#lib/components/FormMessage.svelte";
import SubmitButton from "#lib/components/SubmitButton.svelte";
import { m } from "#lib/paraglide/messages.js";
import { getFormFieldMetadata } from "./fields.ts";
import { setFormContext } from "./form-context.ts";
import {
	type AnyFormSchema,
	computeFieldErrors,
	errorMessageId,
	objectEntries,
	translateFormText,
	validateField,
} from "./form-utils.ts";
import { registerDirtyChecker } from "./unsaved-changes.ts";

type ButtonProps = ComponentProps<typeof Button>;

export interface FormSubmitResult {
	fieldErrors?: Record<string, string>;
}

interface Props {
	schema: AnyFormSchema;
	defaultValues?: Record<string, unknown> | null;
	/**
	 * Sends the raw form values to the server, normally by calling a remote
	 * `command()` whose arg schema is this form's schema. Return `fieldErrors`
	 * keyed by field name to reject; anything else counts as success.
	 */
	onSubmit: (
		values: Record<string, unknown>,
	) => Promise<FormSubmitResult | null | undefined | void>;
	title?: string;
	submitButtonText?: string;
	submitButtonTestId?: string;
	/** Styling of the submit button, for forms embedded somewhere the default button is too heavy. */
	submitButtonVariant?: ButtonProps["variant"];
	submitButtonSize?: ButtonProps["size"];
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
	secondarySubmit?: Snippet;
	/** Called once after a submission completes successfully. */
	onSuccess?: () => void;
	children: Snippet;
}

let {
	schema,
	defaultValues,
	onSubmit,
	title,
	submitButtonText,
	submitButtonTestId,
	submitButtonVariant,
	submitButtonSize,
	fullWidth = false,
	readOnly = false,
	secondarySubmit,
	onSuccess,
	children,
}: Props = $props();

// svelte-ignore state_referenced_locally -- schema & defaults seed the initial values only
const values = $state(buildInitialValues(schema, defaultValues));
let clientErrors = $state<Record<string, string>>({});
let serverErrors = $state<Record<string, string>>({});
let hasSubmitted = $state(false);
let pending = $state(false);
let fallbackError = $state<string | null>(null);

let dirty = false;

$effect(() =>
	registerDirtyChecker(() => !readOnly && dirty && !pending),
);

setFormContext({
	get schema() {
		return schema;
	},
	get defaultValues() {
		return defaultValues;
	},
	get readOnly() {
		return readOnly;
	},
	get hasSubmitted() {
		return hasSubmitted;
	},
	get pending() {
		return pending;
	},
	get values() {
		return values;
	},
	value(name) {
		return values[name];
	},
	setValue(name, value) {
		dirty = true;
		values[name] = value;
		clearServerError(name);
		if (hasSubmitted) {
			clientErrors = computeFieldErrors(schema, snapshotValues());
		}
	},
	clientError(name) {
		return clientErrors[name];
	},
	serverError(name) {
		return serverErrors[name];
	},
	displayedError(name) {
		return serverErrors[name] ?? clientErrors[name];
	},
	validateSingle(name, value) {
		const error = validateField(schema, name, value);
		if (error === undefined) {
			if (!(name in clientErrors)) return;
			const next = { ...clientErrors };
			delete next[name];
			clientErrors = next;
			return;
		}
		clientErrors = { ...clientErrors, [name]: error };
	},
	handleBlur(name, latestValue) {
		if (hasSubmitted) {
			clientErrors = computeFieldErrors(schema, snapshotValues());
			return;
		}
		this.validateSingle(name, latestValue ?? values[name]);
	},
});

function snapshotValues() {
	return $state.snapshot(values) as Record<string, unknown>;
}

// Server errors are keyed by field path. When the user edits a field, the
// server's verdict for that field — and for any nested descendants — is stale,
// so drop it.
function clearServerError(name: string) {
	const isStale = (key: string) =>
		key === name || key.startsWith(`${name}.`) || key.startsWith(`${name}[`);
	if (!Object.keys(serverErrors).some(isStale)) return;

	const next: Record<string, string> = {};
	for (const [key, value] of Object.entries(serverErrors)) {
		if (!isStale(key)) next[key] = value;
	}
	serverErrors = next;
}

async function handleSubmit(event: SubmitEvent) {
	event.preventDefault();
	if (pending) return;

	hasSubmitted = true;
	serverErrors = {};

	const submittedValues = snapshotValues();
	const newErrors = computeFieldErrors(schema, submittedValues);

	if (Object.keys(newErrors).length > 0) {
		clientErrors = newErrors;
		scrollToFirstError(newErrors);
		return;
	}
	clientErrors = {};

	pending = true;
	try {
		const result = await onSubmit(submittedValues);

		if (result && "fieldErrors" in result && result.fieldErrors) {
			serverErrors = result.fieldErrors;
			scrollToFirstError(result.fieldErrors);
			return;
		}

		dirty = false;
		onSuccess?.();
	} finally {
		pending = false;
	}
}

function scrollToFirstError(errors: Record<string, string>) {
	const errorFieldNames = Object.keys(errors);
	if (errorFieldNames.length === 0) return;

	const firstError = findFirstErrorElementInDomOrder(errorFieldNames);
	if (firstError) {
		focusAndScrollToError(firstError);
		fallbackError = null;
	} else {
		const firstErrorField = errorFieldNames[0];
		const firstErrorMessage = errors[firstErrorField];
		fallbackError = firstErrorMessage
			? `${translateFormText(firstErrorMessage)} (${firstErrorField})`
			: null;
	}
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

function buildInitialValues(
	initialSchema: AnyFormSchema,
	initialDefaults: Record<string, unknown> | null | undefined,
) {
	const result: Record<string, unknown> = {};

	for (const [key, fieldSchema] of Object.entries(
		objectEntries(initialSchema),
	)) {
		const formField = getFormFieldMetadata(fieldSchema);

		const defaultValue = initialDefaults?.[key];
		if (defaultValue !== undefined) {
			result[key] = defaultValue;
		} else if (formField) {
			result[key] = formField.initialValue;
		}
	}

	return result;
}
</script>

<form class={["form", { fullWidth }]} novalidate onsubmit={handleSubmit}>
	{#if title}<h2 class="title">{title}</h2>{/if}
	{@render children()}
	{#if !readOnly}
		<div class="mt-4 stack horizontal md mx-auto justify-center items-center">
			<SubmitButton
				testId={submitButtonTestId}
				{pending}
				variant={submitButtonVariant}
				size={submitButtonSize}
			>
				{submitButtonText ?? m.forms_submit()}
			</SubmitButton>
			{#if secondarySubmit}{@render secondarySubmit()}{/if}
		</div>
	{/if}
	{#if fallbackError}
		<div class="mt-4 mx-auto" data-testid="fallback-form-error">
			<FormMessage type="error">{fallbackError}</FormMessage>
		</div>
	{/if}
</form>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
		width: 100%;
		max-width: 24rem;
		margin: 0 auto;

		&.fullWidth {
			margin: 0;
			max-width: none;
		}
	}

	.title {
		font-size: var(--font-lg);
		font-weight: var(--weight-extra);
	}
</style>
