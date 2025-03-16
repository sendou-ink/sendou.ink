import clsx from "clsx";

export type FormFieldSize = "extra-small" | "small" | "medium";

export function formFieldSizeToClassName(size?: FormFieldSize) {
	return clsx({
		"input__extra-small": size === "extra-small",
		input__small: size === "small",
		input__medium: size === "medium",
	});
}
