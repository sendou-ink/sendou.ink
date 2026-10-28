import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import {
	StreamCard,
	StreamCardUser,
} from "~/features/live-streams/components/StreamCard";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import type { TournamentStream as TournamentStreamType } from "~/features/tournament-bracket/core/Tournament";
import { useTournament } from "~/features/tournament/tournament-context";
import { tournamentTeamPage } from "~/utils/urls";

export function TournamentStream({
	streamer,
	withThumbnail = true,
}: {
	streamer: LiveStream.StreamerStreams<TournamentStreamType>;
	withThumbnail?: boolean;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const mostViewed = streamer.streams[0];

	const team =
		mostViewed.teamId !== null ? tournament.teamById(mostViewed.teamId) : null;

	const castName =
		tournament.ctx.castAccounts?.find((castAccount) =>
			LiveStream.isSameAccount(castAccount, mostViewed),
		)?.name ?? mostViewed.account;

	return (
		<StreamCard
			streamer={streamer}
			withThumbnail={withThumbnail}
			testId="tournament-stream"
			title={
				mostViewed.user ? (
					<StreamCardUser user={mostViewed.user} />
				) : (
					<span className="stack horizontal sm items-center">
						<Avatar size="xxs" url={tournament.ctx.logoUrl} />
						{t("tournament:streams.cast")}
						<span className="text-lighter truncate">{castName}</span>
					</span>
				)
			}
			aside={
				team ? (
					<Link
						to={tournamentTeamPage({
							tournamentId: tournament.ctx.id,
							tournamentTeamId: team.id,
						})}
						className="stack horizontal xs items-center text-theme-secondary"
						title={team.name}
					>
						<Avatar size="xxs" url={team.logoUrl} identiconInput={team.name} />
						<span className="truncate">{team.name}</span>
					</Link>
				) : null
			}
		/>
	);
}
