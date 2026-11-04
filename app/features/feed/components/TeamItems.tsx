import clsx from "clsx";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import type { PlayableWindowTier } from "~/features/availability/availability-types";
import { TierDot } from "~/features/availability/components/PlayableWindowsSummary";
import { lfgSearchParams } from "~/features/lfg/lfg-search-params";
import { LFG_PAGE, scrimsPage, teamPage, teamSchedulePage } from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import type { ScrimPostReason } from "../core/FeedScrimMatch";
import type { FeedItemContent } from "./FeedItemCard";
import {
	countText,
	DateBlock,
	DayTime,
	LogoAvatar,
	MapTiles,
	UserName,
	UserStack,
} from "./FeedParts";
import partsStyles from "./FeedParts.module.css";
import styles from "./TeamItems.module.css";

const SCRIM_POST_REASON_TEXTS: Record<ScrimPostReason, string | null> = {
	REQUESTED: "You requested",
	USUAL_OPPONENT: "You scrim them often",
	ASSOCIATION: "Shared to your association",
	FIT: null,
};

const HEAT_TIER_CLASSES: Record<PlayableWindowTier, string> = {
	FULL: styles.heatFull,
	ONE_SHORT: styles.heatOneShort,
};

export function teamItemContent(item: FeedItem): FeedItemContent | null {
	switch (item.type) {
		case "TEAM_JOIN": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> joined <TeamLink team={data.team} />
					</>
				),
				body: (
					<div className={clsx(partsStyles.inset, partsStyles.rowNoWrap)}>
						<LogoAvatar
							url={data.team.avatarUrl}
							name={data.team.name}
							size="sm"
						/>
						<div className={partsStyles.grow}>
							<div className="font-semi-bold">{data.team.name}</div>
							<div className="text-xs text-lighter">
								{countText(data.team.members.length, "member")}
								{data.role ? ` · joined as ${data.role.toLowerCase()}` : ""}
							</div>
						</div>
						<UserStack users={data.team.members} />
					</div>
				),
			};
		}
		case "TEAM_NEW": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> created <TeamLink team={data.team} />
					</>
				),
				body: (
					<div className={partsStyles.inset}>
						<div className={partsStyles.rowNoWrap}>
							<LogoAvatar
								url={data.team.avatarUrl}
								name={data.team.name}
								size="sm"
							/>
							<div className={partsStyles.grow}>
								<div className="font-bold">{data.team.name}</div>
								<div className="text-xs text-lighter">
									{countText(data.team.members.length, "member")}
								</div>
							</div>
							<UserStack users={data.team.members} />
						</div>
						{data.team.bio ? (
							<blockquote className={styles.bio}>{data.team.bio}</blockquote>
						) : null}
					</div>
				),
			};
		}
		case "TEAM_ANNIVERSARY": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={data.team.avatarUrl} name={data.team.name} />,
				line: (
					<>
						{data.isOwnTeam ? "Your team " : null}
						<TeamLink team={data.team} /> turned <b>{data.years}</b>
					</>
				),
				body: (
					<div className={clsx(partsStyles.inset, partsStyles.rowNoWrap)}>
						<span className={partsStyles.bigScore}>{data.years}</span>
						<div className={partsStyles.grow}>
							<div className="font-semi-bold">
								{data.years === 1 ? "year" : "years"} together
							</div>
							<div className="text-xs text-lighter">
								{countText(data.tournamentCount, "tournament")} played as a team
							</div>
						</div>
						<UserStack users={data.team.members} />
					</div>
				),
			};
		}
		case "TEAM_AVAILABILITY": {
			const { data } = item;
			const fullDayCount = data.days.filter(
				(day) => day.tier === "FULL",
			).length;
			const oneShortDayCount = data.days.filter(
				(day) => day.tier === "ONE_SHORT",
			).length;
			return {
				avatar: <LogoAvatar url={data.team.avatarUrl} name={data.team.name} />,
				line: (
					<>
						<b>
							{data.freeCount} of {data.team.members.length}
						</b>{" "}
						on <TeamLink team={data.team} /> are free together
					</>
				),
				body: (
					<>
						<div className={styles.heat}>
							{data.days.map((day) => (
								<div
									key={day.startsAt}
									className={clsx(
										styles.heatDay,
										day.tier ? HEAT_TIER_CLASSES[day.tier] : undefined,
									)}
								>
									<div className={styles.heatBar}>
										<i
											style={{
												height: `${Math.round((day.maxFree / Math.max(1, data.team.members.length)) * 100)}%`,
											}}
										/>
									</div>
									<LocaleTime
										inline
										date={day.startsAt}
										options={{ weekday: "narrow" }}
									/>
								</div>
							))}
						</div>
						<div className={partsStyles.rowNoWrap}>
							<span className={clsx("text-xs", styles.tierCounts)}>
								<span className={styles.tierCount}>
									<TierDot full />
									<span>
										<b>{countText(fullDayCount, "day")}</b> with{" "}
										{data.minPlayers}+
									</span>
								</span>
								{oneShortDayCount > 0 ? (
									<span className={styles.tierCount}>
										<TierDot full={false} />
										<span>
											<b>{countText(oneShortDayCount, "day")}</b> with{" "}
											{data.minPlayers - 1}
										</span>
									</span>
								) : null}
							</span>
							<span className="ml-auto">
								<UserStack users={data.freeUsers} />
							</span>
						</div>
					</>
				),
				href: teamSchedulePage(data.team.customUrl),
			};
		}
		case "TEAM_EVENT_ADDED": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> added{" "}
						<Link
							to={teamSchedulePage(data.team.customUrl)}
							className="font-bold"
						>
							{data.name}
						</Link>{" "}
						to <TeamLink team={data.team} />
					</>
				),
				body: (
					<div className={clsx(partsStyles.inset, partsStyles.rowNoWrap)}>
						<DateBlock at={data.startsAt} />
						<div className={partsStyles.grow}>
							<div className="font-semi-bold">{data.name}</div>
							<div className="text-xs text-lighter">
								<DayTime at={data.startsAt} /> –{" "}
								<LocaleTime
									inline
									date={data.endsAt}
									options={{ hour: "numeric", minute: "2-digit" }}
								/>
							</div>
						</div>
						{data.members.length > 0 ? (
							<UserStack users={data.members} />
						) : null}
					</div>
				),
			};
		}
		case "SCRIM_POST": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={data.team.avatarUrl} name={data.team.name} />,
				line: (
					<>
						<TeamLink team={data.team} /> is looking for a scrim
					</>
				),
				body: (
					<>
						<div className={partsStyles.inset}>
							<div className="font-semi-bold">
								{data.isLookingNow ? "Now" : <DayTime at={data.startsAt} />}
							</div>
							<div className="text-xs text-lighter">
								{data.reason && SCRIM_POST_REASON_TEXTS[data.reason]
									? `${SCRIM_POST_REASON_TEXTS[data.reason]} · `
									: ""}
								{data.divs ? `Div ${data.divs.max}–${data.divs.min} · ` : ""}
								{data.requestCount} requests so far
							</div>
						</div>
						{data.text ? (
							<div className={clsx(partsStyles.quote, "text-xs text-lighter")}>
								{data.text}
							</div>
						) : null}
					</>
				),
				href: scrimsPage(),
			};
		}
		case "SCRIM_RESULT": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={data.team.avatarUrl} name={data.team.name} />,
				line: (
					<>
						<TeamLink team={data.team} /> scrimmed{" "}
						{data.opponent ? (
							<TeamLink team={data.opponent} />
						) : (
							"a pickup team"
						)}
					</>
				),
				body: <MapTiles maps={data.maps} max={data.maps.length} />,
			};
		}
		case "LFG_PLAYER": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> is looking for a team
					</>
				),
				body: (
					<>
						<div className={partsStyles.quote}>{data.text}</div>
						<div className={clsx(partsStyles.row, partsStyles.between)}>
							<div className={partsStyles.row}>
								{data.weaponSplIds.map((weaponSplId) => (
									<WeaponImage
										key={weaponSplId}
										weaponSplId={weaponSplId}
										variant="build"
										size={26}
									/>
								))}
							</div>
							<span className="text-xs text-lighter">{data.timezone}</span>
						</div>
					</>
				),
				href: lfgSearchParams.href(LFG_PAGE, { post: data.postId }),
			};
		}
		case "LFG_TEAM": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={data.team.avatarUrl} name={data.team.name} />,
				line: (
					<>
						<TeamLink team={data.team} /> is recruiting
					</>
				),
				body: (
					<>
						<div className={partsStyles.quote}>{data.text}</div>
						<span className="text-xs text-lighter">
							Posted by <UserName user={data.actor} /> · {data.timezone}
						</span>
					</>
				),
				href: lfgSearchParams.href(LFG_PAGE, { post: data.postId }),
			};
		}
		default:
			return null;
	}
}

function TeamLink({ team }: { team: { name: string; customUrl: string } }) {
	return (
		<Link to={teamPage(team.customUrl)} className="font-bold">
			{team.name}
		</Link>
	);
}
