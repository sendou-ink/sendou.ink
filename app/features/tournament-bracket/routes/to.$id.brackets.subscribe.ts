import type { LoaderFunctionArgs } from "@remix-run/node";
import { eventStream } from "remix-utils/sse/server";

import { tournamentIdFromParams } from "~/features/tournament";
import { emitter } from "../core/emitters.server";
import { bracketSubscriptionKey } from "../tournament-bracket-utils";

export const loader = ({ request, params }: LoaderFunctionArgs) => {
	const tournamentId = tournamentIdFromParams(params);

	return eventStream(request.signal, (send) => {
		const handler = (args: {
			matchId: number;
			scores: [number, number];
			isOver: boolean;
		}) => {
			send({
				event: bracketSubscriptionKey(tournamentId),
				data: `${args.matchId}-${args.scores[0]}-${args.scores[1]}-${String(
					args.isOver,
				)}`,
			});
		};

		emitter.addListener(bracketSubscriptionKey(tournamentId), handler);
		return () => {
			emitter.removeListener(bracketSubscriptionKey(tournamentId), handler);
		};
	});
};
