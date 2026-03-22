import { User } from "lucide-react";
import { Avatar } from "~/components/Avatar";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { twitchThumbnailUrlToSrc } from "~/modules/twitch/utils";
import { twitchUrl } from "~/utils/urls";
import { useTournament } from "../routes/to.$id";
import styles from "../tournament.module.css";

export function TournamentStream({
	stream,
	withThumbnail = true,
}: {
	stream: Tournament["streams"][number];
	withThumbnail?: boolean;
}) {
	const tournament = useTournament();
	const team = tournament.ctx.teams.find((team) =>
		team.members.some((m) => m.userId === stream.userId),
	);
	const user = team?.members.find((m) => m.userId === stream.userId);

	return (
		<div
			key={stream.userId}
			className="stack sm"
			data-testid="tournament-stream"
		>
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
					<div className={styles.streamUserContainer}>
						<Avatar size="xxs" user={user} /> {user.username}
						<span className="text-theme-secondary">{team.name}</span>
					</div>
				) : (
					<div className={styles.streamUserContainer}>
						<Avatar size="xxs" url={tournament.ctx.logoUrl} />
						Cast <span className="text-lighter">{stream.twitchUserName}</span>
					</div>
				)}
				<div className={styles.streamViewerCount}>
					<User />
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
