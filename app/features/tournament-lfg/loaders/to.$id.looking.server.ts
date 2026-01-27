import type { LoaderFunctionArgs } from "react-router";

// Phase 5: Implement loader here
// See app/features/sendouq/loaders/q.looking.server.ts for pattern reference

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const tournamentId = Number(params.id);

	return {
		tournamentId,
		groups: [],
		ownGroup: null,
		likes: { given: [], received: [] },
	};
};
