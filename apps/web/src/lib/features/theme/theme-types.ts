import type { CustomThemeVar } from "./theme-constants.ts";

export type CustomTheme = Omit<Record<CustomThemeVar, number>, "--_chat-h"> & {
	"--_chat-h": number | null;
};
