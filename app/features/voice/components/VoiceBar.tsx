import clsx from "clsx";
import {
	Headphones,
	Mic,
	MicOff,
	PhoneOff,
	Star,
	Volume2,
	VolumeX,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { InfoPopover } from "~/components/InfoPopover";
import { useUser } from "~/features/auth/core/user";
import type { ChatRoomListItem } from "~/features/chat/chat-types";
import type { CommonUser } from "~/utils/kysely.server";
import {
	type VoiceCall,
	type VoiceRoomState,
	voiceClient,
} from "../voice-client";
import { VOICE_FEEDBACK_COMMENT_MAX_LENGTH } from "../voice-constants";
import { useVoiceRoom, useVoiceSnapshot } from "../voice-hooks";
import styles from "./VoiceBar.module.css";

const DAILY_PRIVACY_POLICY_URL = "https://www.daily.co/legal/privacy/";
const RATINGS = [1, 2, 3, 4, 5];

export function VoiceBar({ room }: { room: ChatRoomListItem }) {
	const voiceRoom = useVoiceRoom(room);
	const { call, pendingFeedback } = useVoiceSnapshot();

	const inThisCall = call?.roomId === room.id;
	const feedback = pendingFeedback?.roomId === room.id ? pendingFeedback : null;

	if (!voiceRoom?.available && !inThisCall && !feedback) return null;

	return (
		<div className={styles.voiceBar}>
			{inThisCall ? (
				<InCallControls call={call} room={room} voiceRoom={voiceRoom} />
			) : voiceRoom ? (
				<IdleBar room={room} voiceRoom={voiceRoom} />
			) : null}
			{feedback ? <FeedbackPrompt /> : null}
		</div>
	);
}

export function VoiceCallStrip({
	title,
	onOpen,
}: {
	title: string;
	onOpen: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const { call } = useVoiceSnapshot();

	if (!call) return null;

	return (
		<div className={clsx(styles.voiceBar, styles.strip)}>
			<button type="button" className={styles.stripTitle} onClick={onOpen}>
				<StatusDot status={call.status} />
				{t("common:chat.voice.inCall", { room: title })}
			</button>
			<MicButton call={call} compact />
			<LeaveButton />
		</div>
	);
}

function IdleBar({
	room,
	voiceRoom,
}: {
	room: ChatRoomListItem;
	voiceRoom: VoiceRoomState;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.row}>
			<Headphones size={16} className={styles.voiceIcon} />
			<span className={styles.label}>{t("common:chat.voice.title")}</span>
			<span className={styles.betaBadge}>{t("common:chat.voice.beta")}</span>
			<InfoPopover tiny>
				<div className="stack xs text-sm">
					<span>{t("common:chat.voice.provider")}</span>
					<a href={DAILY_PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
						{t("common:chat.voice.privacyPolicy")}
					</a>
				</div>
			</InfoPopover>
			<UserAvatars
				userIds={voiceRoom.userIds}
				participants={room.participants}
			/>
			{voiceRoom.canJoin ? (
				<SendouButton
					size="small"
					variant="outlined"
					className="ml-auto"
					icon={<Headphones />}
					onClick={() => void voiceClient.join(room.id)}
				>
					{t("common:chat.voice.join")}
				</SendouButton>
			) : null}
		</div>
	);
}

function InCallControls({
	call,
	room,
	voiceRoom,
}: {
	call: VoiceCall;
	room: ChatRoomListItem;
	voiceRoom: VoiceRoomState | null;
}) {
	const { t } = useTranslation(["common"]);

	if (call.status === "FAILED") {
		return (
			<div className={styles.row}>
				<span className="text-error text-sm">
					{t("common:chat.voice.failed")}
				</span>
				<SendouButton
					size="small"
					variant="outlined"
					className="ml-auto"
					onClick={() => void voiceClient.join(room.id)}
				>
					{t("common:chat.voice.retry")}
				</SendouButton>
				<SendouButton
					size="small"
					variant="minimal-destructive"
					onClick={() => void voiceClient.leave()}
				>
					{t("common:actions.close")}
				</SendouButton>
			</div>
		);
	}

	return (
		<div className="stack xs">
			<div className={styles.row}>
				<StatusDot status={call.status} />
				<span className={styles.label}>
					{call.status === "CONNECTED"
						? t("common:chat.voice.connected")
						: t("common:chat.voice.connecting")}
				</span>
				<InputModeToggle call={call} />
				<div className={styles.actions}>
					<MicButton call={call} />
					<LeaveButton />
				</div>
			</div>
			<CallParticipants
				call={call}
				participants={room.participants}
				canKick={voiceRoom?.canKick ?? false}
				roomId={room.id}
			/>
			{call.audioBlocked ? (
				<SendouButton
					size="small"
					variant="primary"
					icon={<Volume2 />}
					onClick={() => voiceClient.resumeAudio()}
				>
					{t("common:chat.voice.enableSound")}
				</SendouButton>
			) : null}
			{call.errorKind === "MIC_DENIED" ? (
				<span className="text-warning text-xs">
					{t("common:chat.voice.micDenied")}
				</span>
			) : call.errorKind === "MIC_NOT_FOUND" ? (
				<span className="text-warning text-xs">
					{t("common:chat.voice.micNotFound")}
				</span>
			) : null}
		</div>
	);
}

function MicButton({
	call,
	compact = false,
}: {
	call: VoiceCall;
	/** Push-to-talk as an icon only, where the bar has no room for its label. */
	compact?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const disabled = call.status !== "CONNECTED";

	if (call.inputMode === "PUSH_TO_TALK") {
		const setTalking = (talking: boolean) => {
			if (call.micEnabled !== talking) voiceClient.setMicEnabled(talking);
		};

		return (
			<SendouButton
				size="small"
				variant={call.micEnabled ? "success" : "outlined"}
				icon={<Mic />}
				shape={compact ? "square" : undefined}
				aria-label={compact ? t("common:chat.voice.holdToTalk") : undefined}
				isDisabled={disabled}
				className={styles.pushToTalk}
				onPointerDown={() => setTalking(true)}
				onPointerUp={() => setTalking(false)}
				onPointerCancel={() => setTalking(false)}
				onPointerLeave={() => setTalking(false)}
				onKeyDown={(event) => {
					if (event.key === " " || event.key === "Enter") setTalking(true);
				}}
				onKeyUp={() => setTalking(false)}
				onContextMenu={(event) => event.preventDefault()}
			>
				{compact ? null : t("common:chat.voice.holdToTalk")}
			</SendouButton>
		);
	}

	return (
		<SendouButton
			size="small"
			shape="square"
			variant={call.micEnabled ? "success" : "minimal"}
			icon={call.micEnabled ? <Mic /> : <MicOff />}
			isDisabled={disabled}
			aria-label={
				call.micEnabled
					? t("common:chat.voice.mute")
					: t("common:chat.voice.unmute")
			}
			aria-pressed={call.micEnabled}
			onClick={() => voiceClient.setMicEnabled(!call.micEnabled)}
		/>
	);
}

function LeaveButton() {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			size="small"
			shape="square"
			variant="destructive"
			icon={<PhoneOff />}
			aria-label={t("common:chat.voice.leave")}
			onClick={() => void voiceClient.leave()}
		/>
	);
}

function InputModeToggle({ call }: { call: VoiceCall }) {
	const { t } = useTranslation(["common"]);
	const isPushToTalk = call.inputMode === "PUSH_TO_TALK";

	return (
		<button
			type="button"
			className={styles.modeToggle}
			onClick={() =>
				voiceClient.setInputMode(isPushToTalk ? "OPEN_MIC" : "PUSH_TO_TALK")
			}
		>
			{isPushToTalk
				? t("common:chat.voice.mode.pushToTalk")
				: t("common:chat.voice.mode.openMic")}
		</button>
	);
}

function CallParticipants({
	call,
	participants,
	canKick,
	roomId,
}: {
	call: VoiceCall;
	participants: CommonUser[];
	canKick: boolean;
	roomId: number;
}) {
	const { t } = useTranslation(["common"]);
	const { volumeByUserId } = useVoiceSnapshot();

	return (
		<ul className={styles.participants}>
			{call.participants.map((participant) => {
				const user = participants.find(
					(candidate) => candidate.id === participant.userId,
				);
				const speaking = call.speakingSessionIds.includes(
					participant.sessionId,
				);
				const avatar = (
					<Avatar
						size="xxs"
						user={user}
						identiconInput={String(participant.userId)}
						alt={user?.username ?? ""}
						className={clsx(styles.avatar, speaking && styles.speaking)}
					/>
				);

				if (participant.isLocal) {
					return (
						<li key={participant.sessionId} className={styles.participant}>
							{avatar}
						</li>
					);
				}

				const volume = volumeByUserId.get(participant.userId) ?? 1;

				return (
					<li key={participant.sessionId} className={styles.participant}>
						<SendouPopover
							trigger={
								<button
									type="button"
									className={styles.participantButton}
									aria-label={user?.username ?? t("common:chat.voice.title")}
								>
									{avatar}
									{volume === 0 ? (
										<VolumeX size={12} className={styles.mutedIcon} />
									) : null}
								</button>
							}
						>
							<div className="stack sm">
								<span className="font-semi-bold">{user?.username ?? "?"}</span>
								<label className="stack xxs text-sm">
									{t("common:chat.voice.volume")}
									<input
										type="range"
										min={0}
										max={100}
										value={Math.round(volume * 100)}
										onChange={(event) =>
											voiceClient.setVolume(
												participant.userId,
												Number(event.target.value) / 100,
											)
										}
									/>
								</label>
								<SendouButton
									size="small"
									variant="outlined"
									icon={volume === 0 ? <Volume2 /> : <VolumeX />}
									onClick={() =>
										voiceClient.setVolume(
											participant.userId,
											volume === 0 ? 1 : 0,
										)
									}
								>
									{volume === 0
										? t("common:chat.voice.unmuteUser")
										: t("common:chat.voice.muteUser")}
								</SendouButton>
								{canKick ? (
									<SendouButton
										size="small"
										variant="minimal-destructive"
										onClick={() =>
											void voiceClient.kick(roomId, participant.userId)
										}
									>
										{t("common:chat.voice.kick")}
									</SendouButton>
								) : null}
							</div>
						</SendouPopover>
					</li>
				);
			})}
		</ul>
	);
}

function UserAvatars({
	userIds,
	participants,
}: {
	userIds: number[];
	participants: CommonUser[];
}) {
	const { t } = useTranslation(["common"]);

	if (userIds.length === 0) return null;

	return (
		<ul
			className={styles.participants}
			aria-label={t("common:chat.voice.inVoice", { count: userIds.length })}
		>
			{userIds.map((userId) => {
				const user = participants.find((candidate) => candidate.id === userId);

				return (
					<li key={userId} className={styles.participant}>
						<Avatar
							size="xxxsm"
							user={user}
							identiconInput={String(userId)}
							alt={user?.username ?? ""}
							className={styles.avatar}
						/>
					</li>
				);
			})}
		</ul>
	);
}

function StatusDot({ status }: { status: VoiceCall["status"] }) {
	return (
		<span
			className={clsx(styles.statusDot, {
				[styles.statusConnected]: status === "CONNECTED",
				[styles.statusFailed]: status === "FAILED",
			})}
		/>
	);
}

function FeedbackPrompt() {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const [rating, setRating] = React.useState<number | null>(null);
	const [comment, setComment] = React.useState("");

	if (!user) return null;

	return (
		<div className={styles.feedback}>
			<span className="text-sm font-semi-bold">
				{t("common:chat.voice.feedback.question")}
			</span>
			<div className={styles.stars}>
				{RATINGS.map((value) => (
					<button
						key={value}
						type="button"
						className={clsx(
							styles.star,
							rating !== null && value <= rating && styles.starSelected,
						)}
						aria-label={t("common:chat.voice.feedback.rating", {
							rating: value,
						})}
						aria-pressed={rating === value}
						onClick={() => setRating(value)}
					>
						<Star size={18} />
					</button>
				))}
			</div>
			{rating !== null ? (
				<>
					<textarea
						className={styles.comment}
						value={comment}
						maxLength={VOICE_FEEDBACK_COMMENT_MAX_LENGTH}
						placeholder={t("common:chat.voice.feedback.comment")}
						onChange={(event) => setComment(event.target.value)}
					/>
					<SendouButton
						size="small"
						onClick={() =>
							void voiceClient.submitFeedback({
								rating,
								comment: comment.trim() || null,
							})
						}
					>
						{t("common:actions.submit")}
					</SendouButton>
				</>
			) : null}
			<SendouButton
				size="small"
				variant="minimal"
				onClick={() => voiceClient.dismissFeedback()}
			>
				{t("common:actions.dismiss")}
			</SendouButton>
		</div>
	);
}
