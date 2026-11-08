import { useEffect, useState } from "react";
import { ErrorBoundary as ClientErrorBoundary } from "react-error-boundary";
import type { MetaFunction } from "react-router";
import { fixedLanguageMiddleware } from "~/modules/i18n/i18next.server";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BROADCAST_DESIGN_MESSAGE,
	BROADCAST_DESIGN_READY_MESSAGE,
} from "../broadcast-constants";
import type { BroadcastDesignMessage } from "../broadcast-types";
import { BroadcastOverlay } from "../components/BroadcastOverlay";
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

/** The designer's preview: the overlay rendering the mock state the designer embedding it posts. */
export default function BroadcastDesignCanvasPage() {
	const [design, setDesign] = useState<BroadcastDesignMessage | null>(null);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (
				event.origin !== window.location.origin ||
				event.source !== window.parent ||
				event.data?.type !== BROADCAST_DESIGN_MESSAGE
			) {
				return;
			}

			setDesign(event.data as BroadcastDesignMessage);
		};

		window.addEventListener("message", onMessage);
		window.parent.postMessage(
			{ type: BROADCAST_DESIGN_READY_MESSAGE },
			window.location.origin,
		);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	if (!design) return null;

	return (
		// a crash (e.g. on a half typed edit) shows nothing, tried again with the next state
		<ClientErrorBoundary fallback={null} resetKeys={[design.state]}>
			<BroadcastOverlay
				state={design.state}
				view="live"
				rehearsals={design.rehearsals}
			/>
		</ClientErrorBoundary>
	);
}

export function ErrorBoundary() {
	return null;
}
