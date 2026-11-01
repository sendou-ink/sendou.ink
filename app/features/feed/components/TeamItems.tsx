import clsx from "clsx";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { teamPage } from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import type { FeedItemContent } from "./FeedItemCard";
import {
	DayTime,
	LogoAvatar,
	MapTiles,
	UserName,
	UserStack,
} from "./FeedParts";
import styles from "./FeedParts.module.css";

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
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<LogoAvatar
							url={data.team.avatarUrl}
							name={data.team.name}
							size="sm"
						/>
						<div className={styles.grow}>
							<div className="font-semi-bold">{data.team.name}</div>
							<div className="text-xs text-lighter">
								{data.team.members.length} members
								{data.role ? ` · joined as ${data.role.toLowerCase()}` : ""}
							</div>
						</div>
						<UserStack users={data.team.members} />
					</div>
				),
				reactionCount: 4,
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
					<div className={styles.inset}>
						<div className={styles.rowNoWrap}>
							<LogoAvatar
								url={data.team.avatarUrl}
								name={data.team.name}
								size="sm"
							/>
							<div className={styles.grow}>
								<div className="font-bold">{data.team.name}</div>
								<div className="text-xs text-lighter">
									{data.team.members.length}{" "}
									{data.team.members.length === 1 ? "member" : "members"}
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
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<span className={styles.bigScore}>{data.years}</span>
						<div className={styles.grow}>
							<div className="font-semi-bold">
								{data.years === 1 ? "year" : "years"} together
							</div>
							<div className="text-xs text-lighter">
								{data.tournamentCount} tournaments played as a team
							</div>
						</div>
						<UserStack users={data.team.members} />
					</div>
				),
				reactionCount: 9,
			};
		}
		case "TEAM_AVAILABILITY": {
			const { data } = item;
			const bestDayIndex = Math.floor(
				(data.bestStartsAt - data.days[0].startsAt) / 86400,
			);
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
							{data.days.map((day, i) => (
								<div
									key={day.startsAt}
									className={clsx(styles.heatDay, {
										[styles.heatBest]: i === bestDayIndex,
									})}
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
						<div className={styles.rowNoWrap}>
							<span className="text-xs">
								Best window{" "}
								<b>
									<DayTime at={data.bestStartsAt} />
								</b>{" "}
								–{" "}
								<LocaleTime
									inline
									date={data.bestEndsAt}
									options={{ hour: "numeric", minute: "2-digit" }}
								/>
							</span>
							<span className="ml-auto">
								<UserStack users={data.freeUsers} />
							</span>
						</div>
					</>
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
						<div className={styles.inset}>
							<div className="font-semi-bold">
								<DayTime at={data.startsAt} />
							</div>
							<div className="text-xs text-lighter">
								{data.maxDiv !== null && data.minDiv !== null
									? `Div ${data.maxDiv}–${data.minDiv} · `
									: ""}
								{data.requestCount} requests so far
							</div>
						</div>
						{data.text ? (
							<div className={clsx(styles.quote, "text-xs text-lighter")}>
								{data.text}
							</div>
						) : null}
					</>
				),
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
						<div className={styles.quote}>{data.text}</div>
						<div className={clsx(styles.row, styles.between)}>
							<div className={styles.row}>
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
						<div className={styles.quote}>{data.text}</div>
						<span className="text-xs text-lighter">
							Posted by <UserName user={data.actor} /> · {data.timezone}
						</span>
					</>
				),
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
