import clsx from "clsx";
import {
	HeadphoneOff,
	Headphones,
	Mic,
	MicOff,
	Phone,
	PhoneOff,
	RotateCcw,
	Settings,
	Signal,
	VolumeX,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { Spinner } from "~/components/elements/Spinner";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { ActivityButton } from "~/components/layout/ActivityButton";
import {
	ActivityPanel,
	ActivityPanelControls,
	ActivityPanelHeader,
} from "~/components/layout/ActivityPanel";
import {
	useVoiceActivities,
	type VoiceActivityParticipant,
	type VoiceActivityState,
	type VoiceActivity as VoiceActivityValue,
} from "../voice-activity";
import styles from "./VoiceActivity.module.css";
import { VoiceSettingsPanel } from "./VoiceSettingsPanel";

/** The voice call the user is in and the ones they can join, in the header. */
export function VoiceActivity() {
	const { t } = useTranslation(["common"]);
	const voices = useVoiceActivities();

	if (voices.length === 0) return null;

	const call = callOf(voices);
	const isConnected = call?.state.status === "CONNECTED";
	const isSilenced =
		call &&
		(call.state.deafened ||
			(!call.state.micEnabled && call.state.inputMode === "OPEN_MIC"));

	return (
		<ActivityButton
			label={t("common:chat.voice.title")}
			icon={<VoiceStateIcon state={call?.state ?? null} />}
			dot={!call && voices.some((voice) => voice.state.participants.length > 0)}
			tone={
				call?.state.status === "FAILED" || (isConnected && isSilenced)
					? "error"
					: isConnected
						? "success"
						: undefined
			}
		>
			<VoicePanel voices={voices} />
		</ActivityButton>
	);
}

function VoicePanel({ voices }: { voices: VoiceActivityValue[] }) {
	const [view, setView] = React.useState<"main" | "settings">("main");
	const call = callOf(voices);

	if (view === "settings" && call) {
		return <VoiceSettingsPanel voice={call} onBack={() => setView("main")} />;
	}

	return (
		<ActivityPanel>
			{voices.map((voice) => (
				<section key={voice.state.roomId} className={styles.room}>
					{voice === call ? (
						<VoiceCallSection
							voice={voice}
							onOpenSettings={() => setView("settings")}
						/>
					) : (
						<JoinableVoiceSection voice={voice} />
					)}
				</section>
			))}
		</ActivityPanel>
	);
}

function callOf(voices: VoiceActivityValue[]) {
	return voices[0]?.state.status === "AVAILABLE" ? null : (voices[0] ?? null);
}

function JoinableVoiceSection({
	voice: { state, actions },
}: {
	voice: VoiceActivityValue;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<>
			<ActivityPanelHeader
				icon={<StatusDot status={state.status} />}
				title={t("common:chat.voice.available")}
				subtitle={state.roomTitle}
			/>
			<ParticipantList voice={{ state, actions }} />
			<SendouButton size="small" icon={<Phone />} onClick={actions.join}>
				{t("common:chat.voice.join")}
			</SendouButton>
		</>
	);
}

function VoiceCallSection({
	voice: { state, actions },
	onOpenSettings,
}: {
	voice: VoiceActivityValue;
	onOpenSettings: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<>
			<ActivityPanelHeader
				icon={<StatusDot status={state.status} />}
				title={
					state.status === "CONNECTED"
						? t("common:chat.voice.voiceConnected")
						: state.status === "FAILED"
							? t("common:chat.voice.failed")
							: t("common:chat.voice.connecting")
				}
				titleClassName={clsx({
					"text-success": state.status === "CONNECTED",
					"text-error": state.status === "FAILED",
				})}
				subtitle={state.roomTitle}
				end={
					state.status === "CONNECTED" && state.latencyMs !== null ? (
						<span
							className={styles.latency}
							title={t("common:chat.voice.latency")}
						>
							<Signal size={14} />
							{state.latencyMs} ms
						</span>
					) : state.status === "JOINING" ? (
						<Spinner className={styles.spinner} />
					) : null
				}
			/>
			{state.errorKind === "MIC_NOT_FOUND" ? (
				<span className="text-warning text-xs">
					{t("common:chat.voice.micNotFound")}
				</span>
			) : null}
			<ParticipantList voice={{ state, actions }} />
			<ActivityPanelControls>
				{state.status === "FAILED" ? (
					<SendouButton
						size="small"
						variant="minimal"
						icon={<RotateCcw />}
						onClick={actions.join}
					>
						{t("common:chat.voice.retry")}
					</SendouButton>
				) : (
					<div className={styles.buttonGroup}>
						<MicToggle voice={{ state, actions }} />
						<DeafenToggle voice={{ state, actions }} />
					</div>
				)}
				<SendouButton
					size="small"
					shape="square"
					variant="minimal"
					icon={<Settings />}
					aria-label={t("common:chat.voice.settings.title")}
					title={t("common:chat.voice.settings.title")}
					onClick={onOpenSettings}
					className="ml-auto"
				/>
				<SendouButton
					size="small"
					shape="square"
					variant="minimal-destructive"
					icon={<PhoneOff />}
					aria-label={t("common:chat.voice.leave")}
					title={t("common:chat.voice.leave")}
					onClick={actions.leave}
				/>
			</ActivityPanelControls>
		</>
	);
}

function VoiceStateIcon({ state }: { state: VoiceActivityState | null }) {
	if (state?.status === "CONNECTED" && state.deafened) {
		return <HeadphoneOff className={styles.mirrored} />;
	}
	if (
		state?.status === "CONNECTED" &&
		!state.micEnabled &&
		state.inputMode === "OPEN_MIC"
	) {
		return <MicOff className={styles.mirrored} />;
	}

	return <Headphones />;
}

function StatusDot({ status }: { status: VoiceActivityState["status"] }) {
	return (
		<span
			className={clsx(styles.statusDot, {
				[styles.statusDotConnected]: status === "CONNECTED",
				[styles.statusDotFailed]: status === "FAILED",
				[styles.statusDotAvailable]: status === "AVAILABLE",
			})}
		/>
	);
}

function ParticipantList({ voice }: { voice: VoiceActivityValue }) {
	const [expandedKey, setExpandedKey] = React.useState<string | null>(null);

	if (voice.state.participants.length === 0) return null;

	return (
		<ul className={styles.participants}>
			{voice.state.participants.map((participant) => (
				<ParticipantRow
					key={participant.key}
					voice={voice}
					participant={participant}
					isExpanded={expandedKey === participant.key}
					onToggle={() =>
						setExpandedKey(
							expandedKey === participant.key ? null : participant.key,
						)
					}
				/>
			))}
		</ul>
	);
}

function ParticipantRow({
	voice: { state, actions },
	participant,
	isExpanded,
	onToggle,
}: {
	voice: VoiceActivityValue;
	participant: VoiceActivityParticipant;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const [isKickConfirmOpen, setIsKickConfirmOpen] = React.useState(false);
	const username = participant.user?.username ?? "?";
	const canAdjust = state.status !== "AVAILABLE" && !participant.isLocal;

	return (
		<li>
			<button
				type="button"
				className={styles.participant}
				disabled={!canAdjust}
				aria-expanded={canAdjust ? isExpanded : undefined}
				onClick={onToggle}
			>
				<Avatar
					size="xxs"
					user={participant.user}
					identiconInput={
						participant.user ? undefined : String(participant.userId)
					}
					alt={participant.user?.username ?? ""}
					className={clsx(
						styles.avatar,
						participant.speaking && styles.speaking,
					)}
				/>
				<span className="truncate">{username}</span>
				<span className={styles.participantIcons}>
					{participant.volume === 0 ? (
						<VolumeX
							size={14}
							className="text-lighter"
							aria-label={t("common:chat.voice.unmuteUser")}
						/>
					) : null}
					{participant.muted ? (
						<MicOff size={14} className={clsx(styles.mirrored, "text-error")} />
					) : null}
					{participant.deafened ? (
						<HeadphoneOff
							size={14}
							className={clsx(styles.mirrored, "text-error")}
						/>
					) : null}
				</span>
			</button>
			{isExpanded && canAdjust ? (
				<div className={styles.userControls}>
					<label className={styles.userVolume}>
						<span className="text-xxs text-lighter">
							{t("common:chat.voice.volume")}
						</span>
						<input
							type="range"
							min={0}
							max={100}
							value={Math.round(participant.volume * 100)}
							onChange={(event) =>
								actions.setVolume(
									participant.userId,
									Number(event.target.value) / 100,
								)
							}
						/>
						<span className={styles.sliderValue}>
							{Math.round(participant.volume * 100)}%
						</span>
					</label>
					{state.canKick ? (
						<>
							<SendouButton
								size="small"
								variant="minimal-destructive"
								onClick={() => setIsKickConfirmOpen(true)}
							>
								{t("common:chat.voice.kick")}
							</SendouButton>
							<FormWithConfirm
								isOpen={isKickConfirmOpen}
								onOpenChange={setIsKickConfirmOpen}
								dialogHeading={t("common:chat.voice.kickConfirm.heading", {
									user: username,
								})}
								description={
									state.roomType === "SQ_MATCH" ||
									state.roomType === "LOBBY_TEAM"
										? t("common:chat.voice.kickConfirm.set")
										: t("common:chat.voice.kickConfirm.group")
								}
								submitButtonText={t("common:chat.voice.kick")}
								onConfirm={() => actions.kick(participant.userId)}
							/>
						</>
					) : null}
				</div>
			) : null}
		</li>
	);
}

function MicToggle({
	voice: { state, actions },
}: {
	voice: VoiceActivityValue;
}) {
	const { t } = useTranslation(["common"]);
	const isDisabled = state.status !== "CONNECTED";

	if (state.inputMode === "PUSH_TO_TALK") {
		const setTalking = (talking: boolean) => {
			if (state.micEnabled !== talking) actions.setMicEnabled(talking);
		};

		return (
			<SendouButton
				size="small"
				shape="square"
				variant={state.micEnabled ? "minimal-success" : "minimal"}
				icon={<Mic />}
				isDisabled={isDisabled}
				aria-label={t("common:chat.voice.holdToTalk")}
				title={t("common:chat.voice.holdToTalk")}
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
			/>
		);
	}

	const label = state.micEnabled
		? t("common:chat.voice.mute")
		: t("common:chat.voice.unmute");

	return (
		<SendouButton
			size="small"
			shape="square"
			variant={state.micEnabled ? "minimal-success" : "minimal-destructive"}
			icon={state.micEnabled ? <Mic /> : <MicOff className={styles.mirrored} />}
			isDisabled={isDisabled}
			aria-label={label}
			aria-pressed={state.micEnabled}
			title={label}
			onClick={() => actions.setMicEnabled(!state.micEnabled)}
		/>
	);
}

function DeafenToggle({
	voice: { state, actions },
}: {
	voice: VoiceActivityValue;
}) {
	const { t } = useTranslation(["common"]);
	const label = state.deafened
		? t("common:chat.voice.undeafen")
		: t("common:chat.voice.deafen");

	return (
		<SendouButton
			size="small"
			shape="square"
			variant={state.deafened ? "minimal-destructive" : "minimal-success"}
			icon={
				state.deafened ? (
					<HeadphoneOff className={styles.mirrored} />
				) : (
					<Headphones />
				)
			}
			isDisabled={state.status !== "CONNECTED"}
			aria-label={label}
			aria-pressed={state.deafened}
			title={label}
			onClick={() => actions.setDeafened(!state.deafened)}
		/>
	);
}
