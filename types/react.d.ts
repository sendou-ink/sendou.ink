// biome-ignore lint/correctness/noUnusedImports: needed for type augmentation
import type * as React from "react";

declare module "react" {
	interface CSSProperties {
		[key: `--${string}`]: string | number | undefined;
	}
}
