import { tick } from "svelte";
import type { FormObjectSchema } from "~/form/types";
import {
	buildInitialValues,
	computeFieldErrors,
	errorMessageId,
	getNestedValue,
	seedArrayItemDefaults,
	setNestedValue,
	validateField,
} from "~/form/utils";

/**
 * Values and errors of a `SendouStoreForm`, with the React `SendouForm`'s rules: a field's error shows once it
 * is left, after the first submit every change revalidates the whole form (an array append excepted, a fresh
 * empty item shouldn't error at once) and a submit with errors focuses the first one on the page.
 *
 * Values are replaced, never mutated, so that every field reads its own slice by path and updates only when
 * that slice changes, like the React fields subscribing to theirs.
 */
export class FormStore {
	values = $state.raw<Record<string, unknown>>({});
	errors = $state.raw<Partial<Record<string, string>>>({});
	hasSubmitted = $state(false);

	readonly schema: FormObjectSchema;

	constructor(
		schema: FormObjectSchema,
		defaultValues: Record<string, unknown> | undefined,
	) {
		this.schema = schema;
		this.values = buildInitialValues(schema, defaultValues);
	}

	value(name: string): unknown {
		return isNestedPath(name)
			? getNestedValue(this.values, name)
			: this.values[name];
	}

	error(name: string): string | undefined {
		return this.errors[name];
	}

	change(name: string, newValue: unknown) {
		const isAppend = isArrayAppend(this.value(name), newValue);
		this.values = isNestedPath(name)
			? setNestedValue(
					seedArrayItemDefaults(this.schema, this.values, name),
					name,
					newValue,
				)
			: { ...this.values, [name]: newValue };

		if (this.hasSubmitted && !isAppend) this.revalidateAll();
	}

	/** Shows the field's error, if any; `latestValue` for fields that change and validate in one go. */
	blur(name: string, latestValue?: unknown) {
		if (this.hasSubmitted) {
			this.revalidateAll();
			return;
		}

		const error = validateField(
			this.schema,
			name,
			latestValue ?? this.value(name),
		);
		if (error === undefined) {
			if (!(name in this.errors)) return;
			const { [name]: _removed, ...rest } = this.errors;
			this.errors = rest;
			return;
		}
		if (this.errors[name] === error) return;
		this.errors = { ...this.errors, [name]: error };
	}

	/** Validates every field: `true` when the values can be sent, else the first error on the page is focused. */
	async validateForSubmit(): Promise<boolean> {
		this.hasSubmitted = true;
		this.errors = computeFieldErrors(this.schema, this.values);

		const errorNames = Object.keys(this.errors);
		if (errorNames.length === 0) return true;

		await tick();
		focusFirstError(errorNames);
		return false;
	}

	private revalidateAll() {
		this.errors = computeFieldErrors(this.schema, this.values);
	}
}

function isNestedPath(name: string) {
	return name.includes(".") || name.includes("[");
}

function isArrayAppend(previousValue: unknown, newValue: unknown) {
	return (
		Array.isArray(previousValue) &&
		Array.isArray(newValue) &&
		newValue.length > previousValue.length
	);
}

/** In DOM order, focusing the control pointing at the error message, else any control next to it, else the message. */
function focusFirstError(errorNames: string[]) {
	const first = errorNames
		.map((name) => ({
			name,
			element: document.getElementById(errorMessageId(name)),
		}))
		.filter(
			(entry): entry is { name: string; element: HTMLElement } =>
				entry.element !== null,
		)
		.toSorted((a, b) =>
			a.element.compareDocumentPosition(b.element) &
			Node.DOCUMENT_POSITION_FOLLOWING
				? -1
				: 1,
		)
		.at(0);
	if (!first) return;

	const control =
		document.querySelector<HTMLElement>(
			`[aria-errormessage="${errorMessageId(first.name)}"]`,
		) ??
		first.element.parentElement?.querySelector<HTMLElement>(
			"input, select, textarea, button",
		);
	const focusTarget = control ?? first.element;
	if (focusTarget === first.element) {
		first.element.setAttribute("tabindex", "-1");
	}
	focusTarget.focus({ preventScroll: true });
	first.element.scrollIntoView({ behavior: "smooth", block: "center" });
}
