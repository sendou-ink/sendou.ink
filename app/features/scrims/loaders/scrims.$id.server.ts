import type { LoaderFunctionArgs } from "react-router";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "../../../utils/remix.server";
import {
	type AuthenticatedUser,
	requireUser,
} from "../../auth/core/user.server";
import * as Scrim from "../core/Scrim";
import * as ScrimPostRepository from "../ScrimPostRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = await requireUser();

	const post = notFoundIfFalsy(
		await ScrimPostRepository.findById(Number(params.id)),
	);

	if (!Scrim.isAccepted(post)) {
		throw new Response(null, { status: 404 });
	}

	if (!Scrim.isParticipating(post, user.id) && !user.roles.includes("STAFF")) {
		throw new Response(null, { status: 403 });
	}

	const participantIds = Scrim.participantIdsListFromAccepted(post);

	return {
		post,
		chatUsers: await UserRepository.findChatUsersByUserIds(participantIds),
		anyUserPrefersNoScreen:
			await UserRepository.anyUserPrefersNoScreen(participantIds),
		tournamentMapPool: post.mapsTournament
			? await resolveTournamentMapPool(post.mapsTournament.id, user)
			: null,
	};
};

async function resolveTournamentMapPool(
	tournamentId: number,
	user: AuthenticatedUser,
) {
	const data = await tournamentDataCached({ tournamentId, user });

	return data.ctx.toSetMapPool;
}
