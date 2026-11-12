import type { FormFieldItems } from "~/form/types";
import { getLocale } from "#lib/paraglide/runtime.js";
import type { SendouFormContext } from "./form-context.ts";

/** Text of a select, radio or checkbox item: a `forms:` key, a function of the language or the text itself. */
export function resolveItemLabel(
	context: SendouFormContext,
	label: FormFieldItems<string>[number]["label"],
): string {
	if (typeof label === "function") return label(getLocale());

	if (typeof label === "number") return String(label);

	return context.translate(label) ?? label;
}
