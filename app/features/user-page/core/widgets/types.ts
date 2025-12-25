import type { z } from "zod/v4";
import type { ALL_WIDGETS } from "./portfolio";
import type { WIDGET_LOADERS } from "./portfolio-loaders.server";

type WidgetUnion = (typeof ALL_WIDGETS)[number];

export type WidgetId = WidgetUnion["id"];

type ExtractSchema<W> = W extends { schema: infer S }
	? S extends z.ZodTypeAny
		? S
		: never
	: never;

export type StoredWidget = {
	[K in WidgetUnion as K["id"]]: {
		id: K["id"];
	} & (ExtractSchema<K> extends never
		? { settings?: never }
		: { settings: z.infer<ExtractSchema<K>> });
}[WidgetUnion["id"]];

type InferLoaderReturn<T> = T extends (...args: any[]) => Promise<infer R>
	? R
	: never;

export type LoadedWidget = {
	[K in WidgetId]: {
		id: K;
		data: K extends keyof typeof WIDGET_LOADERS
			? InferLoaderReturn<NonNullable<(typeof WIDGET_LOADERS)[K]>>
			: ExtractWidgetSettings<K>;
		slot: Extract<WidgetUnion, { id: K }>["slot"];
	};
}[WidgetId];

export type ExtractWidgetSettings<T extends StoredWidget["id"]> = Extract<
	StoredWidget,
	{ id: T }
>["settings"];
