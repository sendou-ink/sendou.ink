import type { ComponentType, ReactNode } from "react";

/** An app of the dev toolbar, listed in `APP_GROUPS` of `DevToolbar.tsx`. */
export interface DevApp {
	id: string;
	title: string;
	description: string;
	/** Shown on the bar and in the window header, can be a component reading live state. */
	icon: ReactNode;
	/** Overlaid on the bar icon, `DevBadge` or `DevStatusDot`. */
	badge?: ReactNode;
	size: "md" | "lg";
	Component: ComponentType;
	/** Runs once when the toolbar mounts, for recording that has to start before the app is first opened. */
	install?: () => void;
}
