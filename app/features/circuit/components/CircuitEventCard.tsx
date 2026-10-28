import clsx from "clsx";
import { Clapperboard, History, Play } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import type { CircuitEvent } from "../circuit-types";
import { circuitEventAnchorId, circuitModesLabel } from "../circuit-utils";
import styles from "./CircuitEventCard.module.css";

export function UpcomingEventCard({
	event,
	isNext,
}: {
	event: CircuitEvent;
	isNext: boolean;
}) {
	const { t } = useTranslation(["circuit"]);

	return (
		<article
			id={circuitEventAnchorId(event.id)}
			className={clsx(styles.card, styles.upcoming, {
				[styles.major]: event.isMajor,
			})}
		>
			<div className={styles.header}>
				<h3 className={styles.name}>{event.name}</h3>
				{isNext ? (
					<span className={styles.tag}>{t("circuit:next")}</span>
				) : event.isMajor ? (
					<span className={clsx(styles.tag, styles.tagMajor)}>
						{t("circuit:major")}
					</span>
				) : null}
			</div>
			<EventTime event={event} />
			<EventModes event={event} />
		</article>
	);
}

export function PastEventCard({ event }: { event: CircuitEvent }) {
	const { t } = useTranslation(["circuit"]);

	if (!event.result) return null;

	return (
		<article
			id={circuitEventAnchorId(event.id)}
			className={clsx(styles.card, styles.past)}
		>
			<Montage montage={event.result.montage} />
			<div className={styles.pastBody}>
				<div className={styles.header}>
					<div>
						<h3 className={styles.name}>{event.name}</h3>
						<LocaleTime
							date={event.startsAt}
							options={{
								month: "long",
								day: "numeric",
								hour: "numeric",
								minute: "numeric",
							}}
							className={styles.time}
						/>
					</div>
					<div className={styles.resultLinks}>
						<SendouButton variant="ghost" size="small" icon={<Clapperboard />}>
							{t("circuit:vods")}
						</SendouButton>
						{event.result.hasReplayCodes ? (
							<SendouButton variant="ghost" size="small" icon={<History />}>
								{t("circuit:replayCodes")}
							</SendouButton>
						) : null}
					</div>
				</div>
				<div className={styles.winner}>
					<div className={styles.winnerTeam}>
						<Avatar
							url={event.result.winner.logoUrl}
							identiconInput={event.result.winner.name}
							size="sm"
						/>
						<div>
							<div className={styles.winnerLabel}>{t("circuit:winner")}</div>
							<div className={styles.winnerName}>
								{event.result.winner.name}
							</div>
						</div>
					</div>
					<ul className={styles.members}>
						{event.result.winner.members.map((member) => (
							<li key={member.id} className={styles.member}>
								<WeaponImage
									weaponSplId={member.weaponSplId}
									variant="build"
									size={40}
								/>
								<span className={styles.memberUser}>
									<Avatar user={member} size="xxxs" />
									<span className="truncate">{member.username}</span>
								</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</article>
	);
}

function EventTime({ event }: { event: CircuitEvent }) {
	return (
		<LocaleTime
			date={event.startsAt}
			options={{
				weekday: "short",
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "numeric",
			}}
			className={styles.time}
		/>
	);
}

function EventModes({ event }: { event: CircuitEvent }) {
	if (!event.offMode) return null;

	return (
		<span className={styles.modes}>{circuitModesLabel(event.offMode)}</span>
	);
}

function Montage({
	montage,
}: {
	montage: NonNullable<CircuitEvent["result"]>["montage"];
}) {
	const { t } = useTranslation(["circuit"]);
	const videoRef = React.useRef<HTMLVideoElement>(null);
	const [isStarted, setIsStarted] = React.useState(false);

	const start = () => {
		setIsStarted(true);
		void videoRef.current?.play();
	};

	return (
		<div className={styles.montage}>
			{/* biome-ignore lint/a11y/useMediaCaption: montage has no speech */}
			<video
				ref={videoRef}
				src={montage.videoUrl}
				poster={montage.posterUrl}
				className={styles.montageVideo}
				controls={isStarted}
				playsInline
				preload="none"
			/>
			{!isStarted ? (
				<button
					type="button"
					className={styles.montagePlay}
					onClick={start}
					aria-label={t("circuit:playMontage")}
				>
					<span className={styles.montagePlayIcon}>
						<Play />
					</span>
				</button>
			) : null}
		</div>
	);
}
