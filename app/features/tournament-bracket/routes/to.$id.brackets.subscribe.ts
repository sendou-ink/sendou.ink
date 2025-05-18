import type { LoaderFunctionArgs } from "@remix-run/node";
import { eventStream } from "remix-utils/sse/server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { emitter } from "../core/emitters.server";
import { bracketSubscriptionKey } from "../tournament-bracket-utils";

export const loader = ({ request, params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

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
