import type { z } from "zod/v4";
import type { ALL_WIDGETS } from "./portfolio";
import type { WIDGET_LOADERS } from "./portfolio-loaders.server";

export interface Widget<T, S extends z.ZodTypeAny | undefined = undefined> {
	id: string;
	category: "misc" | "badges" | "teams";
	slot: "main" | "side";
	schema?: S;
	load: S extends z.ZodTypeAny
		? (userId: number, data: z.infer<S>) => Promise<T>
		: (userId: number) => Promise<T>;
}

type WidgetUnion = (typeof ALL_WIDGETS)[number];

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
	[K in keyof typeof WIDGET_LOADERS]: {
		id: K;
		data: InferLoaderReturn<(typeof WIDGET_LOADERS)[K]>;
		slot: Extract<WidgetUnion, { id: K }>["slot"];
	};
}[keyof typeof WIDGET_LOADERS];
