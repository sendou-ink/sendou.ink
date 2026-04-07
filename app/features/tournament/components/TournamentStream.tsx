import { Avatar } from "~/components/Avatar";
import { UserIcon } from "~/components/icons/User";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { twitchThumbnailUrlToSrc } from "~/modules/twitch/utils";
import { twitchUrl, youtubeUrl } from "~/utils/urls";
import { useTournament } from "../routes/to.$id";

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

	const streamUrl = hasStreamUrl(stream)
		? stream.url
		: stream.youtubeChannelId
			? youtubeUrl(stream.youtubeChannelId)
			: twitchUrl(stream.twitchUserName!);

	const streamLabel = stream.youtubeChannelId
		? (("title" in stream && stream.title) || stream.youtubeChannelId)
		: stream.twitchUserName!;

	const thumbnailUrl = stream.youtubeChannelId
		? stream.thumbnailUrl
		: twitchThumbnailUrlToSrc(stream.thumbnailUrl!);

	return (
		<div
			key={stream.userId}
			className="stack sm"
			data-testid="tournament-stream"
		>
			{withThumbnail && stream.thumbnailUrl ? (
				<a href={streamUrl} target="_blank" rel="noreferrer">
					<img alt="" src={thumbnailUrl} width={320} height={180} />
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
						<Avatar size="xxs" url={tournament.ctx.logoUrl} />
						Cast <span className="text-lighter" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px", display: "inline-block", verticalAlign: "bottom" }}>{streamLabel}</span>
					</div>
				)}
				<div className="tournament__stream__viewer-count">
					<UserIcon />
					{stream.viewerCount}
				</div>
			</div>
			{!withThumbnail ? (
				<a
					href={streamUrl}
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

function hasStreamUrl(
	stream: Tournament["streams"][number],
): stream is Tournament["streams"][number] & { url: string } {
	return "url" in stream && typeof stream.url === "string";
}
