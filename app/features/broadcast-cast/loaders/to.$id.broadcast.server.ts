import { type LoaderFunctionArgs, redirect } from "react-router";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { broadcastDashboardPage } from "~/features/broadcast/broadcast-urls";
import { requireBroadcastProducer } from "~/features/broadcast/broadcast-utils.server";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as CastChannel from "../core/CastChannel";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "view" },
	);
	requireBroadcastProducer(tournament, user);

	const channels = CastChannel.list(tournament.ctx.castAccounts);
	if (channels.length === 0) return null;

	const producedChannels =
		await BroadcastRepository.findProgramChannelsByTournament({
			userId: user.id,
			tournamentId,
		});
	const channel =
		channels.find((candidate) =>
			producedChannels.some((produced) =>
				LiveStream.isSameAccount(candidate, produced),
			),
		) ?? channels[0];

	throw redirect(broadcastDashboardPage({ tournamentId, slug: channel.slug }));
};
