import type { z } from "zod/v4";
import type { ALL_WIDGETS } from "./portfolio.server";

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

export type LoadedWidget = {
	[K in WidgetUnion as K["id"]]: {
		id: K["id"];
		data: K extends Widget<infer U, any> ? U : never;
		slot: K["slot"];
	} & (ExtractSchema<K> extends never
		? { settings?: never }
		: { settings: z.infer<ExtractSchema<K>> });
}[WidgetUnion["id"]];
