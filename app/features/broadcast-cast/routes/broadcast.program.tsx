import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import {
	BroadcastProgram,
	BroadcastProgramStandby,
} from "~/features/broadcast/components/BroadcastProgram";
import { fixedLanguageMiddleware } from "~/modules/i18n/i18next.server";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CAST_SCENE_SET } from "../components/CastScene";
import { loader } from "../loaders/broadcast.program.server";
import type { Route } from "./+types/broadcast.program";

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

/** A user's OBS URL, showing the broadcast it was last pointed at. */
export default function BroadcastProgramPage() {
	const data = useLoaderData<typeof loader>();

	if (!data.broadcast) {
		return <BroadcastProgramStandby programKey={data.programKey} />;
	}

	return (
		<BroadcastProgram
			sceneSet={CAST_SCENE_SET}
			tournamentId={data.broadcast.tournamentId}
			slug={data.broadcast.slug}
			initialState={data.broadcast.state}
			programKey={data.programKey}
		/>
	);
}

/** On air the error page would cover the footage, nothing is shown instead. */
export function ErrorBoundary() {
	return null;
}
