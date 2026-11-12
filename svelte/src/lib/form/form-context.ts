import { createContext } from "svelte";
import type { RemoteForm, RemoteFormField } from "$app/server";
import type { FormObjectSchema } from "~/form/types";
import type { FormStore } from "./form-store.svelte.ts";

/** What a `SendouForm` (a remote form) or a `SendouStoreForm` (a value store) shares with its `FormField`s. */
export interface SendouFormContext {
	form?: Omit<RemoteForm<any, unknown>, "for">;
	store?: FormStore;
	schema: FormObjectSchema;
	/** Translates a `forms:` key coming from a schema or an issue; anything else is returned as is. */
	translate: (text: string | undefined) => string | undefined;
}

export const [getSendouFormContext, setSendouFormContext] =
	createContext<SendouFormContext>();

/** The remote form's accessor of the field, for its value, input attributes and issues. */
export function fieldOf(
	context: SendouFormContext,
	name: string,
): RemoteFormField<string> {
	if (!context.form) {
		throw new Error(`Field "${name}" is not inside a remote SendouForm`);
	}

	return (context.form.fields as Record<string, RemoteFormField<string>>)[
		name
	];
}

/** The value store of the `SendouStoreForm` the field is in, which the field types beyond text inputs need. */
export function storeOf(context: SendouFormContext, name: string): FormStore {
	if (!context.store) {
		throw new Error(`Field "${name}" is not inside a SendouStoreForm`);
	}

	return context.store;
}
