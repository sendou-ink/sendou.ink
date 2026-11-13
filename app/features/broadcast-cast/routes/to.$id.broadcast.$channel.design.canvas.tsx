import type { MetaFunction } from "react-router";
import { BroadcastDesignCanvas } from "~/features/broadcast/components/BroadcastDesignCanvas";
import { fixedLanguageMiddleware } from "~/modules/i18n/i18next.server";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CAST_SCENE_SET } from "../components/CastScene";
import type { Route } from "./+types/to.$id.broadcast.$channel.design.canvas";

export const middleware: Route.MiddlewareFunction[] = [
	fixedLanguageMiddleware("en"),
];

export const handle: SendouRouteHandle = {
	i18n: ["broadcast"],
	bare: true,
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Broadcast designer",
		location: args.location,
	});
};

/** The designer's preview: the cast overlay rendering the mock state the designer embedding it posts. */
export default function BroadcastDesignCanvasPage() {
	return <BroadcastDesignCanvas sceneSet={CAST_SCENE_SET} />;
}

export function ErrorBoundary() {
	return null;
}
