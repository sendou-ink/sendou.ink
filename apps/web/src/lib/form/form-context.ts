import { createContext } from "svelte";
import type { AnyFormSchema } from "./form-utils.ts";

/**
 * What `SendouForm.svelte` provides to the `FormField`s (and bespoke fields)
 * inside it. Mirrors the React `FormContext` surface, minus the store
 * machinery Svelte's fine-grained reactivity makes unnecessary.
 */
export interface FormContext {
	readonly schema: AnyFormSchema;
	readonly defaultValues: Record<string, unknown> | null | undefined;
	readonly readOnly: boolean;
	readonly hasSubmitted: boolean;
	readonly pending: boolean;
	readonly values: Record<string, unknown>;
	value(name: string): unknown;
	setValue(name: string, value: unknown): void;
	clientError(name: string): string | undefined;
	serverError(name: string): string | undefined;
	/** The error a field should display: server verdict first, else client. */
	displayedError(name: string): string | undefined;
	/** Re-validates a single field (used on blur before the first submit). */
	validateSingle(name: string, value: unknown): void;
	/** Called by fields when the user leaves them. */
	handleBlur(name: string, latestValue?: unknown): void;
}

export const [getFormContext, setFormContext] = createContext<FormContext>();

export function getOptionalFormContext(): FormContext | undefined {
	try {
		return getFormContext();
	} catch {
		return undefined;
	}
}
