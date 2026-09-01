// biome-ignore lint/correctness/noUnusedImports: needed for type augmentation
import type * as React from "react";

type InvokerCommand =
	| "show-modal"
	| "close"
	| "request-close"
	| "show-popover"
	| "hide-popover"
	| "toggle-popover"
	| `--${string}`;

declare module "react" {
	interface CSSProperties {
		[key: `--${string}`]: string | number | undefined;
	}

	// invoker commands (https://open-ui.org/components/invokers.explainer/) are
	// not in @types/react yet; lowercase so React passes them through as-is
	interface ButtonHTMLAttributes<T> {
		commandfor?: string | undefined;
		command?: InvokerCommand | undefined;
	}
}
