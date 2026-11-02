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
import styles from "./FeedParts.module.css";

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
					<div className={styles.hero}>
						<div className={clsx(styles.rowNoWrap, styles.between)}>
							<div className={styles.rowNoWrap}>
								<Placement placement={1} size={44} textOnly={false} />
								<div className="text-xs text-lighter">
									of {data.participantCount} teams
								</div>
							</div>
							<LogoAvatar
								url={data.tournament?.logoUrl ?? null}
								name={data.tournament?.name ?? ""}
								size="sm"
							/>
						</div>
						<div className={clsx(styles.row, styles.between)}>
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
									<div key={i} className={clsx(styles.player, "text-xs")}>
										<WinLoss isWin={match.isWin} />
										<span className={styles.ellipsis}>
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
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<Placement placement={data.placement} size={36} />
						<div className={styles.grow}>
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
					<div className={styles.list}>
						{data.rows.map((row) => (
							<div key={row.user.id} className={styles.digestRow}>
								<Avatar user={row.user} size="xxsm" />
								<div className={styles.ellipsis}>
									<div className={clsx(styles.ellipsis, "text-xs")}>
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
									className={clsx(styles.placing, {
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
						<div className={styles.inset}>
							<TournamentRow tournament={data.tournament} />
						</div>
						<div className={clsx(styles.row, styles.between)}>
							<div className={styles.rowNoWrap}>
								<UserStack users={data.team.members} />
								<b className="text-xs">{data.team.name}</b>
							</div>
							<span className="text-xs text-lighter">
								{data.teamCount} teams registered
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
					<div className={clsx(styles.inset, styles.vs)}>
						<div className={styles.vsSide}>
							<LogoAvatar
								url={data.winner.avatarUrl}
								name={data.winner.name}
								size="sm"
							/>
							<span className={styles.ellipsis}>{data.winner.name}</span>
							<span className={styles.pill}>Seed {data.winnerSeed}</span>
						</div>
						<div className={styles.bigScore}>
							{data.score[0]}–{data.score[1]}
						</div>
						<div className={clsx(styles.vsSide, "text-lighter")}>
							<LogoAvatar
								url={data.loser.avatarUrl}
								name={data.loser.name}
								size="sm"
							/>
							<span className={styles.ellipsis}>{data.loser.name}</span>
							<span className={styles.pill}>Seed {data.loserSeed}</span>
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
					<div className={styles.inset}>
						{data.note ? <div className={styles.quote}>{data.note}</div> : null}
						<div className={styles.rowNoWrap}>
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
					<div className={styles.rowNoWrap}>
						<DateBlock at={data.tournament.startsAt} />
						<div className={clsx("stack xs", styles.grow)}>
							<span className="text-xs text-lighter">
								<DayTime at={data.tournament.startsAt} />
								{data.teamCount > 0 ? ` · ${data.teamCount} teams` : null}
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
						<b>{data.seriesName}</b> standings, last 90 days
					</>
				),
				body: (
					<>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={styles.rankCell}>#</th>
									<th>Player</th>
									<th className={styles.numeric}>Events</th>
									<th className={styles.numeric}>Points</th>
								</tr>
							</thead>
							<tbody>
								{data.rows.map((row) => (
									<tr
										key={row.user.id}
										className={clsx({ [styles.highlightRow]: row.isKnown })}
									>
										<td className={styles.rankCell}>{row.placement}</td>
										<td>
											<div className={styles.rowNoWrap}>
												<Avatar user={row.user} size="xxxsm" />
												<Link to={userPage(row.user)}>{row.user.username}</Link>
											</div>
										</td>
										<td className={styles.numeric}>{row.eventCount}</td>
										<td className={styles.numeric}>
											<b>{row.points}</b>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<div className="text-xs text-lighter">
							Mock scoring: 1st 10 · 2nd 7 · 3rd 5 · 4th 4 · played 1
						</div>
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
						<div className={styles.thumb}>
							{data.platform === "YOUTUBE" ? (
								<img
									src={`https://i.ytimg.com/vi/${data.platformVideoId}/mqdefault.jpg`}
									alt=""
									loading="lazy"
								/>
							) : null}
							<span className={styles.thumbPlay}>
								<Play size={22} fill="currentColor" />
							</span>
							<span className={clsx(styles.thumbTag, styles.pill)}>
								{data.platform === "TWITCH" ? "Twitch" : "YouTube"}
								{data.viewCount ? ` · ${data.viewCount} views` : ""}
							</span>
						</div>
						<div className={clsx(styles.rowNoWrap, styles.between, "text-xs")}>
							<span className={styles.ellipsis}>
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
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<Badge badge={data.badge} size={56} isAnimated={false} />
						<div>
							<div className="font-semi-bold">{data.badge.displayName}</div>
							<div className="text-xs text-lighter">
								From {data.tournament?.name} · {data.ownerCount} players own it
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
					<div className={clsx(styles.hero, styles.heroRow)}>
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
						<div className={styles.list}>
							{data.tournaments.map((tournament) => (
								<div key={tournament.id} className={styles.digestRow}>
									<LogoAvatar
										url={tournament.logoUrl}
										name={tournament.name}
										size="xs"
									/>
									<div className={styles.ellipsis}>
										<div className={styles.ellipsis}>
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
									<div className={styles.rowNoWrap}>
										{tournament.tier !== null ||
										tournament.tentativeTier !== null ? (
											<TierPill
												tier={(tournament.tier ?? tournament.tentativeTier)!}
												isTentative={tournament.tier === null}
												withoutAnimation
											/>
										) : null}
										<span className="text-xs text-lighter">
											{tournament.teamsCount} teams
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
						<b>{data.teamCount} teams</b>
					</>
				),
				body: (
					<>
						<table className={styles.table}>
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
												[styles.highlightRow]:
													row.isOwn || row.known.length > 0,
											})}
										>
											<td className={styles.rankCell}>#{row.projectedSeed}</td>
											<td>
												<div className={styles.rowNoWrap}>
													<UserStack users={row.team.members} max={4} />
													<span className={styles.ellipsis}>
														{row.team.name}
													</span>
													{row.isOwn ? (
														<span className={styles.pill}>You</span>
													) : row.known.length > 0 ? (
														<span className={styles.pill}>
															{row.known
																.map((member) => member.username)
																.join(", ")}
														</span>
													) : null}
												</div>
											</td>
											<td className={styles.numeric}>
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
					<div className={styles.inset}>
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
		<div className={styles.hero}>
			<div className={clsx(styles.rowNoWrap, styles.between)}>
				<TournamentRow tournament={data.tournament} />
				{data.tier !== null ? (
					<TierPill tier={data.tier} withoutAnimation />
				) : null}
			</div>
			<div className={styles.list}>
				{data.podium.map(({ placement, team }) => (
					<div key={team.id} className={styles.digestRow}>
						<Placement placement={placement} size={28} />
						<div className={styles.ellipsis}>
							<div className={clsx(styles.ellipsis, "font-semi-bold")}>
								{team.name}
							</div>
							<div className={clsx(styles.ellipsis, "text-xs text-lighter")}>
								{team.members.map((member) => member.username).join(", ")}
							</div>
						</div>
						<UserStack users={team.members} max={4} />
					</div>
				))}
			</div>
			<div className="text-xs text-lighter">{data.teamCount} teams</div>
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
