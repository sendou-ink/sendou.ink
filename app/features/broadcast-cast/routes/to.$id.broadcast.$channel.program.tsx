import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { BroadcastProgram } from "~/features/broadcast/components/BroadcastProgram";
import { fixedLanguageMiddleware } from "~/modules/i18n/i18next.server";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CAST_SCENE_SET } from "../components/CastScene";
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

	return (
		<BroadcastProgram
			sceneSet={CAST_SCENE_SET}
			tournamentId={data.tournamentId}
			slug={data.slug}
			initialState={data.state}
		/>
	);
}

/** On air the error page would cover the footage, nothing is shown instead. */
export function ErrorBoundary() {
	return null;
}
