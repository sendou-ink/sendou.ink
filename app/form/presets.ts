/** This file composes fields from fields.ts to provide reusable helpers for common use-cases with preset options etc. */

import { modesShort } from "~/modules/in-game-lists/modes";
import { radioGroup } from "./fields";
import type { FormFieldInputGroup, FormsTranslationKey } from "./types";

type WithTypedTranslationKeys<T> = Omit<T, "label" | "bottomText"> & {
	label?: FormsTranslationKey;
	bottomText?: FormsTranslationKey;
};

const MODE_ITEMS = modesShort.map((mode) => ({
	label: `modes.${mode}` as const,
	value: mode,
}));

export function modeRadioGroup(
	args: WithTypedTranslationKeys<
		Omit<
			FormFieldInputGroup<"radio-group", (typeof modesShort)[number]>,
			"type" | "initialValue" | "items"
		>
	>,
) {
	return radioGroup({
		...args,
		items: MODE_ITEMS,
	});
}
