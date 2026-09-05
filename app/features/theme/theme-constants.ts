/** CSS variables a supporter can override with their own custom theme. */
export const CUSTOM_THEME_VARS = [
	"--_base-h",
	"--_base-c-0",
	"--_base-c-1",
	"--_base-c-2",
	"--_base-c-3",
	"--_base-c-4",
	"--_base-c-5",
	"--_base-c-6",
	"--_base-c-7",
	"--_acc-h",
	"--_acc-c-0",
	"--_acc-c-1",
	"--_acc-c-2",
	"--_acc-c-3",
	"--_acc-c-4",
	"--_acc-c-5",
	"--_second-h",
	"--_second-c-0",
	"--_second-c-1",
	"--_second-c-2",
	"--_second-c-3",
	"--_second-c-4",
	"--_second-c-5",
	"--_chat-h",
	"--_radius-box",
	"--_radius-field",
	"--_radius-selector",
	"--_border-width",
	"--_size-field",
	"--_size-selector",
	"--_size-spacing",
] as const;

export type CustomThemeVar = (typeof CUSTOM_THEME_VARS)[number];

/** Subset of {@link CUSTOM_THEME_VARS} the footer's patron chip resolves its colors from. */
export const PATRON_CHIP_THEME_VARS = [
	"--_base-h",
	"--_base-c-2",
	"--_base-c-5",
	"--_acc-h",
	"--_acc-c-2",
	"--_acc-c-4",
] as const satisfies ReadonlyArray<CustomThemeVar>;
