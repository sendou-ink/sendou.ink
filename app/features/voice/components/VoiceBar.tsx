import clsx from "clsx";
import {
	HeadphoneOff,
	Headphones,
	Mic,
	MicOff,
	Phone,
	PhoneOff,
	RotateCcw,
	Star,
	Volume2,
	VolumeX,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { useUser } from "~/features/auth/core/user";
import type {
	ChatRoomListItem,
	ChatRoomType,
} from "~/features/chat/chat-types";
import type { CommonUser } from "~/utils/kysely.server";
import {
	type VoiceCall,
	type VoiceRoomState,
	voiceClient,
} from "../voice-client";
import { VOICE_FEEDBACK_COMMENT_MAX_LENGTH } from "../voice-constants";
import { useVoiceRoom, useVoiceSnapshot } from "../voice-hooks";
import styles from "./VoiceBar.module.css";

const RATINGS = [1, 2, 3, 4, 5];

export function VoiceBar({ room }: { room: ChatRoomListItem }) {
	const voiceRoom = useVoiceRoom(room);
	const { call, pendingFeedback } = useVoiceSnapshot();

	const roomCall = call?.roomId === room.id ? call : null;
	const feedback = pendingFeedback?.roomId === room.id ? pendingFeedback : null;

	if (!voiceRoom?.available && !roomCall && !feedback) return null;

	return (
		<div className={styles.voiceBar}>
			{roomCall || voiceRoom ? (
				<div className={styles.row}>
					{roomCall ? (
						<CallStatus call={roomCall} />
					) : (
						<>
							<Headphones size={16} className={styles.voiceIcon} />
							<VoiceLabel />
						</>
					)}
					<div className={styles.actions}>
						{roomCall ? (
							<CallButtons call={roomCall} />
						) : voiceRoom?.canJoin ? (
							<JoinButton roomId={room.id} />
						) : null}
					</div>
				</div>
			) : null}
			{roomCall ? <CallNotices call={roomCall} /> : null}
			<VoiceUsers
				call={roomCall}
				voiceRoom={voiceRoom}
				participants={room.participants}
				roomId={room.id}
				roomType={room.type}
			/>
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
				<span className="truncate">
					{t("common:chat.voice.inCall", { room: title })}
				</span>
			</button>
			<div className={styles.actions}>
				<CallButtons call={call} />
			</div>
		</div>
	);
}

function VoiceLabel() {
	const { t } = useTranslation(["common"]);

	return (
		<>
			<span className={styles.label}>{t("common:chat.voice.title")}</span>
			<span className={styles.betaBadge}>{t("common:chat.voice.beta")}</span>
		</>
	);
}

function CallStatus({ call }: { call: VoiceCall }) {
	const { t } = useTranslation(["common"]);

	return (
		<>
			<StatusDot status={call.status} />
			{call.status === "FAILED" ? (
				<span className={clsx(styles.label, "text-error")}>
					{t("common:chat.voice.failed")}
				</span>
			) : call.status === "CONNECTED" ? (
				<VoiceLabel />
			) : (
				<span className={styles.label}>
					{t("common:chat.voice.connecting")}
				</span>
			)}
		</>
	);
}

function CallButtons({ call }: { call: VoiceCall }) {
	return (
		<>
			{call.status === "FAILED" ? (
				<RetryButton roomId={call.roomId} />
			) : (
				<div className={styles.buttonGroup}>
					<MicButton call={call} />
					<DeafenButton call={call} />
				</div>
			)}
			<LeaveButton />
		</>
	);
}

function CallNotices({ call }: { call: VoiceCall }) {
	const { t } = useTranslation(["common"]);

	return (
		<>
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
		</>
	);
}

function JoinButton({ roomId }: { roomId: number }) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			size="small"
			shape="square"
			variant="outlined-success"
			icon={<Phone />}
			aria-label={t("common:chat.voice.join")}
			title={t("common:chat.voice.join")}
			onClick={() => void voiceClient.join(roomId)}
		/>
	);
}

function RetryButton({ roomId }: { roomId: number }) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			size="small"
			shape="square"
			variant="minimal"
			icon={<RotateCcw />}
			aria-label={t("common:chat.voice.retry")}
			title={t("common:chat.voice.retry")}
			onClick={() => void voiceClient.join(roomId)}
		/>
	);
}

function MicButton({ call }: { call: VoiceCall }) {
	const { t } = useTranslation(["common"]);
	const isPushToTalk = call.inputMode === "PUSH_TO_TALK";
	const label = isPushToTalk
		? t("common:chat.voice.holdToTalk")
		: call.micEnabled
			? t("common:chat.voice.mute")
			: t("common:chat.voice.unmute");

	const setTalking = (talking: boolean) => {
		if (call.micEnabled !== talking) voiceClient.setMicEnabled(talking);
	};
	const pushToTalkHandlers: React.ComponentProps<typeof SendouButton> = {
		onPointerDown: () => setTalking(true),
		onPointerUp: () => setTalking(false),
		onPointerCancel: () => setTalking(false),
		onPointerLeave: () => setTalking(false),
		onKeyDown: (event) => {
			if (event.key === " " || event.key === "Enter") setTalking(true);
		},
		onKeyUp: () => setTalking(false),
		onContextMenu: (event) => event.preventDefault(),
	};

	return (
		<SendouButton
			size="small"
			shape="square"
			variant={call.micEnabled ? "minimal-success" : "minimal-destructive"}
			icon={
				call.micEnabled ? <Mic /> : <MicOff className={styles.mirroredIcon} />
			}
			isDisabled={call.status !== "CONNECTED"}
			aria-label={label}
			aria-pressed={call.micEnabled}
			title={label}
			className={isPushToTalk ? styles.pushToTalk : undefined}
			{...(isPushToTalk
				? pushToTalkHandlers
				: { onClick: () => voiceClient.setMicEnabled(!call.micEnabled) })}
		/>
	);
}

function DeafenButton({ call }: { call: VoiceCall }) {
	const { t } = useTranslation(["common"]);
	const label = call.deafened
		? t("common:chat.voice.undeafen")
		: t("common:chat.voice.deafen");

	return (
		<SendouButton
			size="small"
			shape="square"
			variant={call.deafened ? "minimal-destructive" : "minimal-success"}
			icon={
				call.deafened ? (
					<HeadphoneOff className={styles.mirroredIcon} />
				) : (
					<Headphones />
				)
			}
			isDisabled={call.status !== "CONNECTED"}
			aria-label={label}
			aria-pressed={call.deafened}
			title={label}
			onClick={() => voiceClient.setDeafened(!call.deafened)}
		/>
	);
}

function LeaveButton() {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			size="small"
			shape="square"
			variant="outlined-destructive"
			icon={<PhoneOff />}
			aria-label={t("common:chat.voice.leave")}
			title={t("common:chat.voice.leave")}
			onClick={() => void voiceClient.leave()}
		/>
	);
}

function VoiceUsers({
	call,
	voiceRoom,
	participants,
	roomId,
	roomType,
}: {
	call: VoiceCall | null;
	voiceRoom: VoiceRoomState | null;
	participants: CommonUser[];
	roomId: number;
	roomType: ChatRoomType;
}) {
	const { t } = useTranslation(["common"]);

	const entries = call
		? call.participants.map((participant) => ({
				key: participant.sessionId,
				userId: participant.userId,
				isLocal: participant.isLocal,
				speaking: call.speakingSessionIds.includes(participant.sessionId),
			}))
		: (voiceRoom?.userIds ?? []).map((userId) => ({
				key: String(userId),
				userId,
				isLocal: false,
				speaking: false,
			}));

	if (entries.length === 0) return null;

	return (
		<ul
			className={styles.avatarStack}
			aria-label={t("common:chat.voice.inVoice", { count: entries.length })}
		>
			{entries.map((entry) => {
				const user = participants.find(
					(candidate) => candidate.id === entry.userId,
				);

				return (
					<li key={entry.key} className={styles.stackedUser}>
						{call && !entry.isLocal ? (
							<RemoteUserControls
								userId={entry.userId}
								user={user}
								speaking={entry.speaking}
								canKick={voiceRoom?.canKick ?? false}
								roomId={roomId}
								roomType={roomType}
							/>
						) : (
							<UserAvatar
								userId={entry.userId}
								user={user}
								speaking={entry.speaking}
							/>
						)}
					</li>
				);
			})}
		</ul>
	);
}

function UserAvatar({
	userId,
	user,
	speaking,
}: {
	userId: number;
	user: CommonUser | undefined;
	speaking: boolean;
}) {
	return (
		<Avatar
			size="xxs"
			user={user}
			identiconInput={user ? undefined : String(userId)}
			alt={user?.username ?? ""}
			title={user?.username}
			className={clsx(styles.avatar, speaking && styles.speaking)}
		/>
	);
}

function RemoteUserControls({
	userId,
	user,
	speaking,
	canKick,
	roomId,
	roomType,
}: {
	userId: number;
	user: CommonUser | undefined;
	speaking: boolean;
	canKick: boolean;
	roomId: number;
	roomType: ChatRoomType;
}) {
	const { t } = useTranslation(["common"]);
	const [isKickConfirmOpen, setIsKickConfirmOpen] = React.useState(false);
	const { volumeByUserId } = useVoiceSnapshot();
	const volume = volumeByUserId.get(userId) ?? 1;
	const muteLabel =
		volume === 0
			? t("common:chat.voice.unmuteUser")
			: t("common:chat.voice.muteUser");

	return (
		<>
			<SendouPopover
				trigger={
					<button
						type="button"
						className={styles.userButton}
						aria-label={user?.username ?? t("common:chat.voice.title")}
					>
						<UserAvatar userId={userId} user={user} speaking={speaking} />
						{volume === 0 ? (
							<VolumeX size={12} className={styles.mutedIcon} />
						) : null}
					</button>
				}
			>
				<div className="stack sm">
					<span className="font-semi-bold">{user?.username ?? "?"}</span>
					<div className="stack horizontal xs items-center">
						<SendouButton
							size="small"
							shape="square"
							variant="minimal"
							icon={volume === 0 ? <VolumeX /> : <Volume2 />}
							aria-label={muteLabel}
							title={muteLabel}
							onClick={() =>
								voiceClient.setVolume(userId, volume === 0 ? 1 : 0)
							}
						/>
						<input
							type="range"
							min={0}
							max={100}
							value={Math.round(volume * 100)}
							aria-label={t("common:chat.voice.volume")}
							onChange={(event) =>
								voiceClient.setVolume(userId, Number(event.target.value) / 100)
							}
						/>
					</div>
					{canKick ? (
						<SendouButton
							size="small"
							variant="minimal-destructive"
							onClick={() => setIsKickConfirmOpen(true)}
						>
							{t("common:chat.voice.kick")}
						</SendouButton>
					) : null}
				</div>
			</SendouPopover>
			{canKick ? (
				<FormWithConfirm
					isOpen={isKickConfirmOpen}
					onOpenChange={setIsKickConfirmOpen}
					dialogHeading={t("common:chat.voice.kickConfirm.heading", {
						user: user?.username ?? "?",
					})}
					description={
						roomType === "SQ_MATCH" || roomType === "LOBBY_TEAM"
							? t("common:chat.voice.kickConfirm.set")
							: t("common:chat.voice.kickConfirm.group")
					}
					submitButtonText={t("common:chat.voice.kick")}
					onConfirm={() => void voiceClient.kick(roomId, userId)}
				/>
			) : null}
		</>
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
