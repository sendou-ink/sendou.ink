import clsx from "clsx";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Image, ModeImage, StageImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { navIconUrl } from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import { FEED_ROTATION_MAX_LISTED } from "../feed-constants";
import type { FeedItemContent } from "./FeedItemCard";
import {
	DateBlock,
	DayTime,
	LogoAvatar,
	ordinalPlacement,
	TournamentRow,
	UserName,
	UserStack,
} from "./FeedParts";
import styles from "./FeedParts.module.css";

// xxx: i18n (other files too)

export function communityItemContent(
	item: FeedItem,
	_now: number,
): FeedItemContent | null {
	switch (item.type) {
		case "FRIEND_NEW": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> and <UserName user={data.other} />{" "}
						are now friends
					</>
				),
				body: <UserStack users={[data.actor, data.other]} />,
			};
		}
		case "FRIEND_SUGGEST": {
			const { data } = item;
			const setCount = data.setWins + data.setLosses;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						You've played <b>{setCount} sets</b> with{" "}
						<UserName user={data.actor} />
					</>
				),
				body: (
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<Avatar user={data.actor} size="sm" />
						<div>
							<div className="font-semi-bold">{data.actor.username}</div>
							<div className="text-xs text-lighter">
								{data.setWins}–{data.setLosses} as teammates · not friends yet
							</div>
						</div>
					</div>
				),
				action: { label: "Add friend", doneLabel: "Friend request sent" },
			};
		}
		case "PLUS_RESULTS": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name="Plus Server" />,
				line: (
					<>
						{data.rows.length === 1 ? (
							<>
								<UserName user={data.rows[0].user} /> made it to{" "}
								<b>+{data.rows[0].tier}</b>
							</>
						) : (
							<>
								<b>{data.rows.length} friends</b> made it to a new Plus Server
								tier
							</>
						)}
					</>
				),
				body: (
					<div className={styles.row}>
						{data.rows.map((row) => (
							<span
								key={row.user.id}
								className={clsx(styles.inset, styles.rowNoWrap)}
							>
								<Avatar user={row.user} size="xxs" />
								<UserName user={row.user} />
								<span className={styles.plusTier}>
									<Image
										path={navIconUrl("plus")}
										alt="Plus Server"
										size={14}
									/>
									{row.tier}
								</span>
							</span>
						))}
					</div>
				),
				reactionCount: 10,
			};
		}
		case "SITE_UPDATE": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name="sendou.ink" />,
				line: (
					<>
						<b>sendou.ink</b> update
					</>
				),
				body: (
					<div className="stack sm">
						{data.entries.map((entry) => (
							<div key={entry.headline} className={styles.inset}>
								<div className={styles.rowNoWrap}>
									{entry.navItems?.[0] ? (
										<Image
											path={navIconUrl(entry.navItems[0])}
											alt=""
											size={22}
											containerClassName={styles.noShrink}
										/>
									) : null}
									<span className="font-semi-bold">
										{entry.headline.replaceAll("**", "")}
									</span>
								</div>
								{entry.bullets && entry.bullets.length > 0 ? (
									<ul className="text-xs text-lighter">
										{entry.bullets.slice(0, 3).map((bullet) => (
											<li key={bullet}>{bullet.replaceAll("**", "")}</li>
										))}
									</ul>
								) : null}
							</div>
						))}
					</div>
				),
			};
		}
		case "ROTATION": {
			const { data } = item;
			return {
				avatar: <ModeImage mode={data.rotations[0].mode} size={36} />,
				line: (
					<>
						<b>
							{data.rotations.length} upcoming rotation
							{data.rotations.length === 1 ? "" : "s"}
						</b>{" "}
						in your usual hours with maps from your pool
					</>
				),
				body: (
					<>
						<div className={styles.list}>
							{data.rotations
								.slice(0, FEED_ROTATION_MAX_LISTED)
								.map((rotation) => (
									<div
										key={`${rotation.type}-${rotation.startsAt}`}
										className={styles.rotationRow}
									>
										<div>
											<div className="text-sm font-semi-bold">
												<LocaleTime
													inline
													date={rotation.startsAt}
													options={{
														weekday: "short",
														hour: "numeric",
														minute: "2-digit",
													}}
												/>
											</div>
											<div
												className={clsx(
													styles.rowNoWrap,
													"text-xs text-lighter",
												)}
											>
												<ModeImage mode={rotation.mode} size={16} />
												{rotationTypeLabel(rotation.type)}
											</div>
										</div>
										<div className={styles.rotationStages}>
											{rotation.stageIds.map((stageId) => (
												<StageImage
													key={stageId}
													stageId={stageId}
													width={96}
													className={clsx(styles.rotationStage, {
														[styles.rotationStageOff]:
															!rotation.matchingStageIds.includes(stageId),
													})}
												/>
											))}
										</div>
									</div>
								))}
						</div>
						{data.rotations.length > FEED_ROTATION_MAX_LISTED ? (
							<div className="text-xs text-lighter">
								+{data.rotations.length - FEED_ROTATION_MAX_LISTED} more later
							</div>
						) : null}
					</>
				),
			};
		}
		case "VOICE_ROOM": {
			const { data } = item;
			return {
				avatar: data.users[0] ? (
					<Avatar user={data.users[0]} size="xs" />
				) : null,
				line: (
					<>
						{data.users[0] ? <UserName user={data.users[0]} /> : "Someone"} and{" "}
						{data.userCount - 1} others are in voice
					</>
				),
				body: (
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<UserStack users={data.users} />
						<span className="text-xs text-lighter">
							{data.roomType.replaceAll("_", " ").toLowerCase()}
						</span>
					</div>
				),
			};
		}
		case "MEMORY": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name="Memories" />,
				line: (
					<>
						<b>{data.yearsAgo} years ago</b> you played your first sendou.ink
						tournament
					</>
				),
				body: (
					<>
						<div className={clsx(styles.inset, styles.rowNoWrap)}>
							<TournamentRow tournament={data.tournament} />
							<span className={styles.placing}>
								{ordinalPlacement(data.placement)}
								<span className="text-xs text-lighter">
									/{data.participantCount}
								</span>
							</span>
						</div>
						<div className={clsx(styles.rowNoWrap, "text-xs text-lighter")}>
							<UserStack users={data.team.members} />
							{data.team.name}
						</div>
					</>
				),
			};
		}
		case "CALENDAR_EVENT_NEW": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<Link to={`/calendar/${data.eventId}`} className="font-bold">
							{data.name}
						</Link>{" "}
						was added to the calendar
					</>
				),
				body: (
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<DateBlock at={data.startsAt} />
						<div className={styles.grow}>
							<div className="font-semi-bold">{data.name}</div>
							<div className="text-xs text-lighter">
								<DayTime at={data.startsAt} /> · by {data.actor.username}
							</div>
						</div>
						<div className={styles.row}>
							{data.tags.map((tag) => (
								<span key={tag} className={styles.pill}>
									{tag}
								</span>
							))}
						</div>
					</div>
				),
			};
		}
		default:
			return null;
	}
}

function rotationTypeLabel(type: "X" | "SERIES" | "OPEN") {
	if (type === "X") return "X Battle";

	return `Anarchy ${type === "SERIES" ? "Series" : "Open"}`;
}
