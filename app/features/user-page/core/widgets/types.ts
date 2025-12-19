import type { z } from "zod/v4";
import type { ALL_WIDGETS } from "./portfolio.server";

export interface Widget<T, S extends z.ZodTypeAny> {
	id: string;
	category: "misc" | "badges" | "teams";
	slot: "main" | "side";
	schema?: S;
	load: (userId: number, data: z.infer<S>) => Promise<T>;
}

type WidgetUnion = (typeof ALL_WIDGETS)[number];

export type StoredWidget = {
	[K in WidgetUnion as K["id"]]: {
		id: K["id"];
		data: K extends Widget<any, infer U> ? z.infer<U> : never; // xxx: never not working (can insert data even if it should not have it)
	};
}[WidgetUnion["id"]];

export type LoadedWidget = {
	[K in WidgetUnion as K["id"]]: {
		id: K["id"];
		data: K extends Widget<any, infer U> ? z.infer<U> : never;
		settings: K extends Widget<infer U, any> ? U : never;
		slot: K["slot"];
	};
}[WidgetUnion["id"]];
