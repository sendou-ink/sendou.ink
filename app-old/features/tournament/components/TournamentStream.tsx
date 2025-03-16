import type { SerializeFrom } from "@remix-run/node";
import { Avatar } from "~/components/Avatar";
import { UserIcon } from "~/components/icons/User";
import { twitchThumbnailUrlToSrc } from "~/modules/twitch/utils";
import { twitchUrl } from "~/utils/urls";
import { useTournament } from "../routes/to.$id";
import type { TournamentStreamsLoader } from "../routes/to.$id.streams";

export function TournamentStream({
	stream,
	withThumbnail = true,
}: {
	stream: SerializeFrom<TournamentStreamsLoader>["streams"][number];
	withThumbnail?: boolean;
}) {
	const tournament = useTournament();
	const team = tournament.ctx.teams.find((team) =>
		team.members.some((m) => m.userId === stream.userId),
	);
	const user = team?.members.find((m) => m.userId === stream.userId);

	return (
		<div key={stream.userId} className="stack sm">
			{withThumbnail ? (
				<a
					href={twitchUrl(stream.twitchUserName)}
					target="_blank"
					rel="noreferrer"
				>
					<img
						alt=""
						src={twitchThumbnailUrlToSrc(stream.thumbnailUrl)}
						width={320}
						height={180}
					/>
				</a>
			) : null}
			<div className="stack md horizontal justify-between">
				{user && team ? (
					<div className="tournament__stream__user-container">
						<Avatar size="xxs" user={user} /> {user.username}
						<span className="text-theme-secondary">{team.name}</span>
					</div>
				) : (
					<div className="tournament__stream__user-container">
						<Avatar size="xxs" url={tournament.logoSrc} />
						Cast <span className="text-lighter">{stream.twitchUserName}</span>
					</div>
				)}
				<div className="tournament__stream__viewer-count">
					<UserIcon />
					{stream.viewerCount}
				</div>
			</div>
			{!withThumbnail ? (
				<a
					href={twitchUrl(stream.twitchUserName)}
					target="_blank"
					rel="noreferrer"
					className="text-xxs text-semi-bold text-center"
				>
					Watch now
				</a>
			) : null}
		</div>
	);
}
