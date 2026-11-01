import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { fixedLanguageMiddleware } from "~/modules/i18n/i18next.server";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { BroadcastClipsContext } from "../broadcast-clips-context";
import { BROADCAST_REHEARSE_MESSAGE } from "../broadcast-constants";
import { useBroadcastStream, useClipReceiver } from "../broadcast-hooks";
import { broadcastOverlaySearchParams } from "../broadcast-search-params";
import { broadcastSignalUrl, broadcastStreamUrl } from "../broadcast-urls";
import { BroadcastOverlay } from "../components/BroadcastOverlay";
import { loader } from "../loaders/to.$id.broadcast.$channel.program.server";
import type { Route } from "./+types/to.$id.broadcast.$channel.program";

export { loader };

export const middleware: Route.MiddlewareFunction[] = [
	fixedLanguageMiddleware("en"),
];

export const handle: SendouRouteHandle = {
	i18n: ["broadcast"],
	bare: true,
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Broadcast overlay",
		location: args.location,
	});
};

export const shouldRevalidate = () => false;

export default function BroadcastOverlayPage() {
	const data = useLoaderData<typeof loader>();
	const [{ view, preview }] = useSearchParamsTyped(
		broadcastOverlaySearchParams,
	);
	const pageArgs = { tournamentId: data.tournamentId, slug: data.slug };
	const clips = useClipReceiver({ signalUrl: broadcastSignalUrl(pageArgs) });
	const { state } = useBroadcastStream({
		url: broadcastStreamUrl({
			...pageArgs,
			role: preview ? "preview" : "source",
		}),
		initialState: data.state,
		onMessage: clips.onMessage,
	});
	const rehearsals = useRehearsals({ isEnabled: preview });

	return (
		<BroadcastClipsContext.Provider
			value={{ urls: clips.urls, isMuted: preview }}
		>
			<BroadcastOverlay state={state} view={view} rehearsals={rehearsals} />
		</BroadcastClipsContext.Provider>
	);
}

/** How many times the dashboard embedding this preview asked it to play the staged transition. */
function useRehearsals({ isEnabled }: { isEnabled: boolean }) {
	const [rehearsals, setRehearsals] = useState(0);

	useEffect(() => {
		if (!isEnabled) return;

		const onMessage = (event: MessageEvent) => {
			if (
				event.origin !== window.location.origin ||
				event.data !== BROADCAST_REHEARSE_MESSAGE
			) {
				return;
			}

			setRehearsals((count) => count + 1);
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [isEnabled]);

	return rehearsals;
}
