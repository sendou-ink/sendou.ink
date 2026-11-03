import clsx from "clsx";
import { Play } from "lucide-react";
import * as React from "react";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Badge } from "~/components/Badge";
import { Placement } from "~/components/Placement";
import { TierPill } from "~/components/TierPill";
import { tournamentOrganizationPage } from "~/features/tournament-organization/tournament-organization-urls";
import {
	CALENDAR_PAGE,
	tournamentPage,
	tournamentSubsPage,
	trophyPage,
	userPage,
} from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import type { FeedItemContent } from "./FeedItemCard";
import {
	countText,
	DateBlock,
	DayTime,
	durationText,
	LogoAvatar,
	NavIconAvatar,
	ordinalPlacement,
	TournamentRow,
	UserName,
	UserStack,
	WinLoss,
} from "./FeedParts";
import partsStyles from "./FeedParts.module.css";
import styles from "./TournamentItems.module.css";

// lazy so the WebGL renderer only loads once a trophy post shows up
const FeedTrophy = React.lazy(() =>
	import("./FeedTrophy").then((module) => ({ default: module.FeedTrophy })),
);

const REGISTRATION_TEXTS = {
	OPEN: "Registration open",
	CLOSED: "Registration closed",
	INVITATIONAL: "Invite only",
} as const;

export function tournamentItemContent(
	item: FeedItem,
	now: number,
): FeedItemContent | null {
	switch (item.type) {
		case "TO_WIN": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> won{" "}
						<TournamentLink tournament={data.tournament} />
						{data.seriesWin && data.seriesWin.count > 1 ? (
							<>
								, their{" "}
								<b>
									{ordinalPlacement(data.seriesWin.count)} {data.seriesWin.name}
								</b>{" "}
								win
							</>
						) : null}
					</>
				),
				body: (
					<div className={partsStyles.hero}>
						<div className={clsx(partsStyles.rowNoWrap, partsStyles.between)}>
							<div className={partsStyles.rowNoWrap}>
								<Placement placement={1} size={44} textOnly={false} />
								<div className="text-xs text-lighter">
									of {countText(data.participantCount, "team")}
								</div>
							</div>
							<LogoAvatar
								url={data.tournament?.logoUrl ?? null}
								name={data.tournament?.name ?? ""}
								size="sm"
							/>
						</div>
						<div className={clsx(partsStyles.row, partsStyles.between)}>
							<div>
								<div className="font-bold">{data.team.name}</div>
								<div className="text-xs text-lighter">
									{data.tournament?.organizationName
										? `${data.tournament.organizationName} · `
										: ""}
									seed {data.team.seed ?? "–"} · {data.setWins}–{data.setLosses}{" "}
									in sets
								</div>
							</div>
							<UserStack users={data.team.members} max={6} />
						</div>
						{data.path.length > 0 ? (
							<div className="stack xs">
								{data.path.map((match, i) => (
									<div key={i} className={clsx(partsStyles.player, "text-xs")}>
										<WinLoss isWin={match.isWin} />
										<span className={partsStyles.ellipsis}>
											vs {match.opponentName}
										</span>
										<span className="text-lighter">
											{match.score[0]}–{match.score[1]}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				),
			};
		}
		case "TO_PODIUM": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> placed{" "}
						<b>{ordinalPlacement(data.placement)}</b> at{" "}
						<TournamentLink tournament={data.tournament} />
					</>
				),
				body: (
					<div className={clsx(partsStyles.inset, partsStyles.rowNoWrap)}>
						<Placement placement={data.placement} size={36} />
						<div className={partsStyles.grow}>
							<div className="font-bold">{data.team.name}</div>
							<div className="text-xs text-lighter">
								{ordinalPlacement(data.placement)} of {data.participantCount} ·{" "}
								{data.setWins}–{data.setLosses} in sets
								{data.knownOnTeam.length > 0
									? ` · with ${data.knownOnTeam.map((member) => member.username).join(", ")}`
									: ""}
							</div>
						</div>
						<UserStack users={data.team.members} max={4} />
					</div>
				),
			};
		}
		case "TO_DIGEST": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name="Weekend" />,
				line: (
					<>
						<b>{data.rows.length} friends</b> played {data.tournamentCount}{" "}
						tournaments in the last few days
					</>
				),
				body: (
					<div className={partsStyles.list}>
						{data.rows.map((row) => (
							<div key={row.user.id} className={partsStyles.digestRow}>
								<Avatar user={row.user} size="xxsm" />
								<div className={partsStyles.ellipsis}>
									<div className={clsx(partsStyles.ellipsis, "text-xs")}>
										<UserName user={row.user} /> · {row.teamName}
									</div>
									<Link
										to={tournamentPage(row.tournamentId)}
										className="text-xs text-lighter"
									>
										{row.tournamentName}
									</Link>
								</div>
								<span
									className={clsx(partsStyles.placing, {
										[styles.placingTop]: row.placement <= 3,
									})}
								>
									{ordinalPlacement(row.placement)}
									<span className="text-xs text-lighter">
										/{row.participantCount}
									</span>
								</span>
							</div>
						))}
					</div>
				),
			};
		}
		case "TO_REGISTERED": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> registered for{" "}
						<TournamentLink tournament={data.tournament} />
					</>
				),
				body: (
					<>
						<div className={partsStyles.inset}>
							<TournamentRow tournament={data.tournament} />
						</div>
						<div className={clsx(partsStyles.row, partsStyles.between)}>
							<div className={partsStyles.rowNoWrap}>
								<UserStack users={data.team.members} />
								<b className="text-xs">{data.team.name}</b>
							</div>
							<span className="text-xs text-lighter">
								{countText(data.teamCount, "team")} registered
								{data.tournament?.startsAt
									? ` · in ${durationText(data.tournament.startsAt - now)}`
									: ""}
							</span>
						</div>
					</>
				),
			};
		}
		case "TO_UPSET": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: data.isActorWinner ? (
					<>
						<UserName user={data.actor} />
						's team, seeded {data.winnerSeed}, knocked out seed {data.loserSeed}{" "}
						at <TournamentLink tournament={data.tournament} />
					</>
				) : (
					<>
						<UserName user={data.actor} />
						's team, seeded {data.loserSeed}, was knocked out by seed{" "}
						{data.winnerSeed} at <TournamentLink tournament={data.tournament} />
					</>
				),
				body: (
					<div className={clsx(partsStyles.inset, partsStyles.vs)}>
						<div className={partsStyles.vsSide}>
							<LogoAvatar
								url={data.winner.avatarUrl}
								name={data.winner.name}
								size="sm"
							/>
							<span className={partsStyles.ellipsis}>{data.winner.name}</span>
							<span className={partsStyles.pill}>Seed {data.winnerSeed}</span>
						</div>
						<div className={partsStyles.bigScore}>
							{data.score[0]}–{data.score[1]}
						</div>
						<div className={clsx(partsStyles.vsSide, "text-lighter")}>
							<LogoAvatar
								url={data.loser.avatarUrl}
								name={data.loser.name}
								size="sm"
							/>
							<span className={partsStyles.ellipsis}>{data.loser.name}</span>
							<span className={partsStyles.pill}>Seed {data.loserSeed}</span>
						</div>
					</div>
				),
			};
		}
		case "TO_LFG": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={data.team.avatarUrl} name={data.team.name} />,
				line: (
					<>
						<b>{data.team.name}</b> needs a player for{" "}
						<TournamentLink tournament={data.tournament} />
					</>
				),
				body: (
					<div className={partsStyles.inset}>
						{data.note ? (
							<div className={partsStyles.quote}>{data.note}</div>
						) : null}
						<div className={partsStyles.rowNoWrap}>
							<UserStack users={data.team.members} />
							{Array.from({ length: data.openSpots }, (_, i) => (
								<span key={i} className={styles.emptySlot} />
							))}
							{data.tournament?.startsAt ? (
								<span className="text-xs text-lighter">
									<DayTime at={data.tournament.startsAt} />
								</span>
							) : null}
						</div>
					</div>
				),
				href: tournamentSubsPage(data.team.tournamentId),
			};
		}
		case "TO_ORG_NEW": {
			const { data } = item;
			return {
				avatar: (
					<LogoAvatar
						url={data.organization.avatarUrl}
						name={data.organization.name}
					/>
				),
				line: (
					<>
						<Link
							to={tournamentOrganizationPage({
								organizationSlug: data.organization.slug,
							})}
							className="font-bold"
						>
							{data.organization.name}
						</Link>{" "}
						announced <TournamentLink tournament={data.tournament} />
					</>
				),
				body: data.tournament?.startsAt ? (
					<div className={partsStyles.rowNoWrap}>
						<DateBlock at={data.tournament.startsAt} />
						<div className={clsx("stack xs", partsStyles.grow)}>
							<span className="text-xs text-lighter">
								<DayTime at={data.tournament.startsAt} />
								{data.teamCount > 0
									? ` · ${countText(data.teamCount, "team")}`
									: null}
								{` · ${REGISTRATION_TEXTS[data.registration]}`}
							</span>
							<div className={styles.chain}>
								{data.bracketNames.map((name, i) => (
									<span key={i}>{name}</span>
								))}
							</div>
						</div>
					</div>
				) : null,
			};
		}
		case "TO_SERIES": {
			const { data } = item;
			return {
				avatar: (
					<LogoAvatar
						url={data.organization?.avatarUrl ?? null}
						name={data.organization?.name ?? data.seriesName}
					/>
				),
				line: (
					<>
						{data.organization ? (
							<Link
								to={tournamentOrganizationPage({
									organizationSlug: data.organization.slug,
									seriesId: data.seriesId,
								})}
								className="font-bold"
							>
								{data.seriesName}
							</Link>
						) : (
							<b>{data.seriesName}</b>
						)}{" "}
						standings, last 90 days
					</>
				),
				body: (
					<>
						<table className={partsStyles.table}>
							<thead>
								<tr>
									<th className={partsStyles.rankCell}>#</th>
									<th>Player</th>
									<th className={partsStyles.numeric}>Placements</th>
									<th className={partsStyles.numeric}>Points</th>
								</tr>
							</thead>
							<tbody>
								{data.rows.map((row) => (
									<tr
										key={row.user.id}
										className={clsx({
											[partsStyles.highlightRow]: row.isViewer,
										})}
									>
										<td className={partsStyles.rankCell}>{row.placement}</td>
										<td>
											<div className={partsStyles.rowNoWrap}>
												<Avatar user={row.user} size="xxxsm" />
												<Link to={userPage(row.user)}>{row.user.username}</Link>
											</div>
										</td>
										<td>
											<MedalCounts placements={row.placements} />
										</td>
										<td className={partsStyles.numeric}>
											<b>{row.points}</b>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</>
				),
			};
		}
		case "TO_VOD": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> added a VoD from{" "}
						<TournamentLink tournament={data.tournament} />
					</>
				),
				body: (
					<>
						<div className={partsStyles.thumb}>
							{data.platform === "YOUTUBE" ? (
								<img
									src={`https://i.ytimg.com/vi/${data.platformVideoId}/mqdefault.jpg`}
									alt=""
									loading="lazy"
								/>
							) : null}
							<span className={partsStyles.thumbPlay}>
								<Play size={22} fill="currentColor" />
							</span>
							<span className={clsx(partsStyles.thumbTag, partsStyles.pill)}>
								{data.platform === "TWITCH" ? "Twitch" : "YouTube"}
								{data.viewCount
									? ` · ${countText(data.viewCount, "view")}`
									: ""}
							</span>
						</div>
						<div
							className={clsx(
								partsStyles.rowNoWrap,
								partsStyles.between,
								"text-xs",
							)}
						>
							<span className={partsStyles.ellipsis}>
								<b>{data.teams[0].name}</b> vs <b>{data.teams[1].name}</b>
							</span>
							<span className="text-lighter whitespace-nowrap">
								{data.score[0]}–{data.score[1]}
							</span>
						</div>
					</>
				),
			};
		}
		case "TO_BADGE": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> earned the{" "}
						<b>{data.badge.displayName}</b> badge
					</>
				),
				body: (
					<div className={clsx(partsStyles.inset, partsStyles.rowNoWrap)}>
						<Badge badge={data.badge} size={56} isAnimated={false} />
						<div>
							<div className="font-semi-bold">{data.badge.displayName}</div>
							<div className="text-xs text-lighter">
								From {data.tournament?.name} ·{" "}
								{data.ownerCount === 1
									? "1 player owns it"
									: `${data.ownerCount} players own it`}
							</div>
						</div>
					</div>
				),
			};
		}
		case "TO_TROPHY": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> won a{" "}
						<Link to={trophyPage(data.trophy.id)} className="font-bold">
							{data.trophy.name}
						</Link>{" "}
						trophy
					</>
				),
				body: (
					<div className={clsx(partsStyles.hero, partsStyles.heroRow)}>
						<React.Suspense fallback={<div className={styles.trophySlot} />}>
							<FeedTrophy trophy={data.trophy} tier={data.tier} />
						</React.Suspense>
						<div>
							<div className="font-bold">{data.trophy.name}</div>
							<div className="text-xs text-lighter">
								{data.tournament?.name}
							</div>
						</div>
					</div>
				),
			};
		}
		case "TROPHY_NEW": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> made the{" "}
						<Link to={trophyPage(data.trophy.id)} className="font-bold">
							{data.trophy.name}
						</Link>{" "}
						trophy
					</>
				),
				body: (
					<div className={clsx(partsStyles.hero, partsStyles.heroRow)}>
						<React.Suspense fallback={<div className={styles.trophySlot} />}>
							<FeedTrophy trophy={data.trophy} tier={null} />
						</React.Suspense>
						<div>
							<div className="font-bold">{data.trophy.name}</div>
							{data.organizationName ? (
								<div className="text-xs text-lighter">
									{data.organizationName}
								</div>
							) : null}
						</div>
					</div>
				),
			};
		}
		case "CALENDAR_FRIENDS_SAVED": {
			const { data } = item;
			return {
				avatar: <UserStack users={data.users} max={3} />,
				line: (
					<>
						<b>
							{data.users.length}{" "}
							{data.users.length === 1 ? "friend" : "friends"}
						</b>{" "}
						saved <TournamentLink tournament={data.tournament} />
					</>
				),
				body: (
					<>
						<div className={partsStyles.inset}>
							<TournamentRow tournament={data.tournament} />
						</div>
						<div className={partsStyles.row}>
							{data.users.map((user) => (
								<span key={user.id} className={partsStyles.rowNoWrap}>
									<Avatar user={user} size="xxs" />
									<UserName user={user} />
								</span>
							))}
						</div>
					</>
				),
			};
		}
		case "TO_LUTI_REGISTRATION": {
			const { data } = item;
			return {
				avatar: <NavIconAvatar navIcon="luti" />,
				line: <b>Registration is open for LUTI Season {data.season}</b>,
				body: (
					<div className="text-sm">
						Leagues Under The Ink is back. Sign your team up before the
						deadline.
					</div>
				),
				href: data.href,
			};
		}
		case "TO_SHOWCASE": {
			const { data } = item;
			return {
				avatar: <NavIconAvatar navIcon="calendar" />,
				line: (
					<>
						<b>
							{data.kind === "WEEKEND"
								? "Tournaments this weekend"
								: "Tournaments this week"}
						</b>
					</>
				),
				body: (
					<>
						<div className={partsStyles.list}>
							{data.tournaments.map((tournament) => (
								<div key={tournament.id} className={partsStyles.digestRow}>
									<LogoAvatar
										url={tournament.logoUrl}
										name={tournament.name}
										size="xs"
									/>
									<div className={partsStyles.ellipsis}>
										<div className={partsStyles.ellipsis}>
											<Link
												to={tournamentPage(tournament.id)}
												className="font-bold"
											>
												{tournament.name}
											</Link>
										</div>
										<div className="text-xs text-lighter">
											<DayTime at={tournament.startsAt} />
											{tournament.organization
												? ` · ${tournament.organization.name}`
												: ""}
										</div>
									</div>
									<div className={partsStyles.rowNoWrap}>
										{tournament.tier !== null ||
										tournament.tentativeTier !== null ? (
											<TierPill
												tier={(tournament.tier ?? tournament.tentativeTier)!}
												isTentative={tournament.tier === null}
												withoutAnimation
											/>
										) : null}
										<span className="text-xs text-lighter">
											{countText(tournament.teamsCount, "team")}
										</span>
									</div>
								</div>
							))}
						</div>
					</>
				),
				href: CALENDAR_PAGE,
			};
		}
		case "TO_RESULT_FEATURED": {
			const { data } = item;
			const winner = data.podium[0]?.team;
			return {
				avatar: (
					<LogoAvatar
						url={data.tournament?.logoUrl ?? null}
						name={data.tournament?.name ?? ""}
					/>
				),
				line: (
					<>
						{winner ? <b>{winner.name}</b> : "A team"} won{" "}
						<TournamentLink tournament={data.tournament} />
					</>
				),
				body: <PodiumBody data={data} />,
			};
		}
		case "ON_THIS_DAY": {
			const { data } = item;
			const winner = data.podium[0]?.team;
			return {
				avatar: <LogoAvatar url={null} name="On this day" />,
				line: (
					<>
						<b>
							{data.yearsAgo} {data.yearsAgo === 1 ? "year" : "years"} ago today
						</b>{" "}
						{winner ? <b>{winner.name}</b> : "a team"} won{" "}
						<TournamentLink tournament={data.tournament} />
					</>
				),
				body: <PodiumBody data={data} />,
			};
		}
		case "TO_BRACKET_PREVIEW": {
			const { data } = item;
			return {
				avatar: (
					<LogoAvatar
						url={data.tournament?.logoUrl ?? null}
						name={data.tournament?.name ?? ""}
					/>
				),
				line: (
					<>
						Registration closed for{" "}
						<TournamentLink tournament={data.tournament} /> with{" "}
						<b>{countText(data.teamCount, "team")}</b>
					</>
				),
				body: (
					<>
						<table className={partsStyles.table}>
							<tbody>
								{data.teams.flatMap((row, index) => {
									const previous = data.teams[index - 1];
									const isGap =
										previous && row.projectedSeed > previous.projectedSeed + 1;

									return [
										isGap ? (
											<tr key={`gap-${row.projectedSeed}`}>
												<td colSpan={3} className="text-lighter">
													…
												</td>
											</tr>
										) : null,
										<tr
											key={row.team.id}
											className={clsx({
												[partsStyles.highlightRow]:
													row.isOwn || row.known.length > 0,
											})}
										>
											<td className={partsStyles.rankCell}>
												#{row.projectedSeed}
											</td>
											<td>
												<div className={partsStyles.rowNoWrap}>
													<UserStack users={row.team.members} max={4} />
													<span className={partsStyles.ellipsis}>
														{row.team.name}
													</span>
													{row.isOwn ? (
														<span className={partsStyles.pill}>You</span>
													) : row.known.length > 0 ? (
														<span className={partsStyles.pill}>
															{row.known
																.map((member) => member.username)
																.join(", ")}
														</span>
													) : null}
												</div>
											</td>
											<td className={partsStyles.numeric}>
												{row.sp ? `${row.sp} SP` : "–"}
											</td>
										</tr>,
									];
								})}
							</tbody>
						</table>
						<div className="text-xs text-lighter">
							Projected from the members' SendouQ power, seeding can change
							until the start
							{data.tournament?.startsAt ? (
								<>
									{" "}
									· starts <DayTime at={data.tournament.startsAt} />
								</>
							) : null}
						</div>
					</>
				),
			};
		}
		case "TO_STAFF": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> is{" "}
						{data.role === "ORGANIZER" ? "organizing" : "streaming"}{" "}
						<TournamentLink tournament={data.tournament} />
					</>
				),
				body: (
					<div className={partsStyles.inset}>
						<TournamentRow tournament={data.tournament} />
					</div>
				),
			};
		}
		default:
			return null;
	}
}

function PodiumBody({
	data,
}: {
	data: Extract<FeedItem, { type: "TO_RESULT_FEATURED" }>["data"];
}) {
	return (
		<div className={partsStyles.hero}>
			<div className={clsx(partsStyles.rowNoWrap, partsStyles.between)}>
				<TournamentRow tournament={data.tournament} />
				{data.tier !== null ? (
					<TierPill tier={data.tier} withoutAnimation />
				) : null}
			</div>
			<div className={partsStyles.list}>
				{data.podium.map(({ placement, team }) => (
					<div key={team.id} className={partsStyles.digestRow}>
						<Placement placement={placement} size={28} />
						<div className={partsStyles.ellipsis}>
							<div className={clsx(partsStyles.ellipsis, "font-semi-bold")}>
								{team.name}
							</div>
							<div
								className={clsx(partsStyles.ellipsis, "text-xs text-lighter")}
							>
								{team.members.map((member) => member.username).join(", ")}
							</div>
						</div>
						<UserStack users={team.members} max={4} />
					</div>
				))}
			</div>
			<div className="text-xs text-lighter">
				{countText(data.teamCount, "team")}
			</div>
		</div>
	);
}

function MedalCounts({
	placements,
}: {
	placements: { first: number; second: number; third: number };
}) {
	return (
		<div className={styles.medalCounts}>
			{[placements.first, placements.second, placements.third].map(
				(count, i) => (
					<span key={i} className={styles.medalCount}>
						<Placement placement={i + 1} size={16} />×{count}
					</span>
				),
			)}
		</div>
	);
}

function TournamentLink({
	tournament,
}: {
	tournament?: { tournamentId: number | null; name: string };
}) {
	if (!tournament?.tournamentId) return null;

	return (
		<Link to={tournamentPage(tournament.tournamentId)} className="font-bold">
			{tournament.name}
		</Link>
	);
}
