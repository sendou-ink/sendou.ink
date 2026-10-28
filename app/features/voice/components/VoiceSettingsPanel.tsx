import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	ActivityPanel,
	ActivityPanelHeader,
	ActivityPanelSection,
} from "~/components/layout/ActivityPanel";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as MicInput from "../core/MicInput";
import type { VoiceActivity } from "../voice-activity";
import { canPickOutputDevice, micCapture } from "../voice-audio";
import {
	DEFAULT_DEVICE_ID,
	type VoiceSettings,
	voiceSettingsPersisted,
} from "../voice-persisted";
import styles from "./VoiceSettingsPanel.module.css";

const PROCESSING_SETTINGS = [
	{
		key: "noiseSuppression",
		label: "common:chat.voice.settings.noiseSuppression",
	},
	{
		key: "echoCancellation",
		label: "common:chat.voice.settings.echoCancellation",
	},
	{
		key: "autoGainControl",
		label: "common:chat.voice.settings.autoGainControl",
	},
] as const;

/** Devices, levels and audio processing of the voice call, opened from its header panel. */
export function VoiceSettingsPanel({
	voice: { state, actions },
	onBack,
}: {
	voice: VoiceActivity;
	onBack: () => void;
}) {
	const { t } = useTranslation(["common"]);
	const [settings, setSettings] = usePersistedState(voiceSettingsPersisted);
	const devices = useAudioDevices();

	const update = (patch: Partial<VoiceSettings>) =>
		setSettings((current) => ({ ...current, ...patch }));

	return (
		<ActivityPanel className={styles.panel}>
			<ActivityPanelHeader
				icon={
					<SendouButton
						size="small"
						shape="square"
						variant="minimal"
						icon={<ArrowLeft />}
						aria-label={t("common:actions.back")}
						onClick={onBack}
					/>
				}
				title={t("common:chat.voice.settings.title")}
			/>
			<ActivityPanelSection title={t("common:chat.voice.settings.input")}>
				<DeviceSelect
					label={t("common:chat.voice.settings.inputDevice")}
					devices={devices.input}
					selectedId={settings.inputDeviceId}
					onChange={(inputDeviceId) => update({ inputDeviceId })}
				/>
				<Slider
					label={t("common:chat.voice.settings.inputVolume")}
					value={settings.inputVolume}
					max={200}
					onChange={(inputVolume) => update({ inputVolume })}
				/>
				<div className={styles.levelRow}>
					<span className="text-xxs text-lighter">
						{t("common:chat.voice.settings.inputLevel")}
					</span>
					<InputLevelMeter
						sensitivity={
							state.inputMode === "OPEN_MIC" ? settings.sensitivity : null
						}
					/>
				</div>
				<SendouChipRadioGroup>
					<SendouChipRadio
						name="voice-input-mode"
						value="OPEN_MIC"
						checked={state.inputMode === "OPEN_MIC"}
						onChange={() => actions.setInputMode("OPEN_MIC")}
					>
						{t("common:chat.voice.settings.voiceActivity")}
					</SendouChipRadio>
					<SendouChipRadio
						name="voice-input-mode"
						value="PUSH_TO_TALK"
						checked={state.inputMode === "PUSH_TO_TALK"}
						onChange={() => actions.setInputMode("PUSH_TO_TALK")}
					>
						{t("common:chat.voice.settings.pushToTalk")}
					</SendouChipRadio>
				</SendouChipRadioGroup>
				{state.inputMode === "OPEN_MIC" ? (
					<Slider
						label={t("common:chat.voice.settings.sensitivity")}
						value={settings.sensitivity}
						max={100}
						onChange={(sensitivity) => update({ sensitivity })}
					/>
				) : (
					<span className="text-xxs text-lighter">
						{t("common:chat.voice.settings.pushToTalkHint")}
					</span>
				)}
			</ActivityPanelSection>
			<ActivityPanelSection title={t("common:chat.voice.settings.output")}>
				{canPickOutputDevice() ? (
					<DeviceSelect
						label={t("common:chat.voice.settings.outputDevice")}
						devices={devices.output}
						selectedId={settings.outputDeviceId}
						onChange={(outputDeviceId) => update({ outputDeviceId })}
					/>
				) : (
					<span className="text-xxs text-lighter">
						{t("common:chat.voice.settings.outputDeviceUnsupported")}
					</span>
				)}
				<Slider
					label={t("common:chat.voice.settings.outputVolume")}
					value={Math.min(settings.outputVolume, 100)}
					max={100}
					onChange={(outputVolume) => update({ outputVolume })}
				/>
			</ActivityPanelSection>
			<ActivityPanelSection title={t("common:chat.voice.settings.processing")}>
				{PROCESSING_SETTINGS.filter(
					({ key }) => supportedConstraints()[key],
				).map(({ key, label }) => (
					<SendouSwitch
						key={key}
						size="small"
						isSelected={settings[key]}
						onChange={(isSelected) => update({ [key]: isSelected })}
					>
						{t(label)}
					</SendouSwitch>
				))}
				{/* xxx: the settings page's sound toggles are the source of truth for these, link the two */}
				<SendouSwitch
					size="small"
					isSelected={settings.sounds}
					onChange={(sounds) => update({ sounds })}
				>
					{t("common:chat.voice.settings.sounds")}
				</SendouSwitch>
			</ActivityPanelSection>
		</ActivityPanel>
	);
}

function DeviceSelect({
	label,
	devices,
	selectedId,
	onChange,
}: {
	label: string;
	devices: Array<{ id: string; name: string }>;
	selectedId: string;
	onChange: (id: string) => void;
}) {
	const { t } = useTranslation(["common"]);
	const items = [
		{
			id: DEFAULT_DEVICE_ID,
			name: t("common:chat.voice.settings.defaultDevice"),
		},
		...devices.filter((device) => device.id !== DEFAULT_DEVICE_ID),
	];

	return (
		<SendouSelect
			aria-label={label}
			items={items}
			selectedKey={
				items.some((item) => item.id === selectedId)
					? selectedId
					: DEFAULT_DEVICE_ID
			}
			onSelectionChange={(key) => onChange(String(key))}
		>
			{(item) => (
				<SendouSelectItem key={item.id} id={item.id}>
					{item.name}
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}

function Slider({
	label,
	value,
	max,
	onChange,
}: {
	label: string;
	value: number;
	max: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className={styles.slider}>
			<span className="text-xxs text-lighter">{label}</span>
			<input
				type="range"
				min={0}
				max={max}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			/>
			<span className={styles.sliderValue}>{value}%</span>
		</label>
	);
}

function InputLevelMeter({ sensitivity }: { sensitivity: number | null }) {
	const meterRef = React.useRef<HTMLSpanElement>(null);

	React.useEffect(() => {
		let frame = requestAnimationFrame(function draw() {
			meterRef.current?.style.setProperty(
				"--level",
				`${MicInput.meterPosition(micCapture.level())}%`,
			);
			frame = requestAnimationFrame(draw);
		});

		return () => cancelAnimationFrame(frame);
	}, []);

	return (
		<span
			ref={meterRef}
			className={styles.level}
			data-gated={sensitivity !== null}
			style={{ "--sensitivity": `${sensitivity ?? 0}%` } as React.CSSProperties}
		/>
	);
}

function useAudioDevices() {
	const [devices, setDevices] = React.useState<{
		input: Array<{ id: string; name: string }>;
		output: Array<{ id: string; name: string }>;
	}>({ input: [], output: [] });

	React.useEffect(() => {
		const mediaDevices = navigator.mediaDevices;
		if (!mediaDevices?.enumerateDevices) return;

		let cancelled = false;
		const load = () => {
			void mediaDevices.enumerateDevices().then((all) => {
				if (cancelled) return;
				const ofKind = (kind: MediaDeviceKind) =>
					all
						.filter((device) => device.kind === kind && device.label)
						.map((device) => ({ id: device.deviceId, name: device.label }));
				setDevices({
					input: ofKind("audioinput"),
					output: ofKind("audiooutput"),
				});
			});
		};

		load();
		mediaDevices.addEventListener("devicechange", load);

		return () => {
			cancelled = true;
			mediaDevices.removeEventListener("devicechange", load);
		};
	}, []);

	return devices;
}

function supportedConstraints(): MediaTrackSupportedConstraints {
	return navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
}
