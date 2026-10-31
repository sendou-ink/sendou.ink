import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { fixedLanguageMiddleware } from "~/modules/i18n/i18next.server";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { useBroadcastStream } from "../broadcast-hooks";
import { broadcastOverlaySearchParams } from "../broadcast-search-params";
import { broadcastStreamUrl } from "../broadcast-urls";
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
	const { state } = useBroadcastStream({
		url: broadcastStreamUrl({
			tournamentId: data.tournamentId,
			slug: data.slug,
			role: preview ? "preview" : "source",
		}),
		initialState: data.state,
	});
	return <BroadcastOverlay state={state} view={view} />;
}
