/**
 * Coach mode's playback bar under the video: play/pause in the middle, steps
 * back through games, lives and events on its left mirrored by steps forward
 * on its right (the smaller the step the closer to the middle), and the
 * playback speed. Every control has a hotkey under the left hand: a keyboard
 * row per step, its left key back and right key forward.
 */
import clsx from "clsx";
import {
	ChevronLeft,
	ChevronRight,
	type LucideIcon,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	StepBack,
	StepForward,
} from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import * as CoachPlayback from "../core/CoachPlayback";
import styles from "./CoachControls.module.css";

export type CoachStep = "GAME" | "LIFE" | "EVENT";

interface StepControl {
	label: string;
	/** `KeyboardEvent.code`: the key's place on the keyboard, whatever its layout */
	code: string;
	icon: LucideIcon;
}

/** outermost (the largest step) first */
const STEPS: ReadonlyArray<{
	step: CoachStep;
	caption: string;
	previous: StepControl;
	next: StepControl;
}> = [
	{
		step: "GAME",
		caption: "Game",
		previous: { label: "Previous game", code: "KeyZ", icon: SkipBack },
		next: { label: "Next game", code: "KeyC", icon: SkipForward },
	},
	{
		step: "LIFE",
		caption: "Life",
		previous: { label: "Previous respawn", code: "KeyA", icon: StepBack },
		next: { label: "Next respawn", code: "KeyD", icon: StepForward },
	},
	{
		step: "EVENT",
		caption: "Event",
		previous: { label: "Previous event", code: "KeyQ", icon: ChevronLeft },
		next: { label: "Next event", code: "KeyE", icon: ChevronRight },
	},
];

const PLAY_CODES = ["Space", "KeyK"];
const SLOWER_CODE = "KeyS";
const FASTER_CODE = "KeyW";

/** input types a key press doesn't type into */
const KEYLESS_INPUT_TYPES = new Set(["button", "checkbox", "radio", "range"]);

export type CoachJumps = Record<
	CoachStep,
	Record<CoachPlayback.Direction, (() => void) | null>
>;

export function CoachControls({
	isPaused,
	speed,
	jumps,
	onTogglePlay,
	onSpeedChange,
}: {
	isPaused: boolean;
	speed: number;
	/** each step's jump; null where there's nowhere to go */
	jumps: CoachJumps;
	onTogglePlay: () => void;
	onSpeedChange: (speed: number) => void;
}) {
	const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
		if (!isHotkey(event)) return;

		const action = hotkeyAction(event.code);
		if (!action) return;
		event.preventDefault();
		action();
	});

	// hotkeys work wherever focus is on the page, the video in fullscreen too
	useEffect(() => {
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const hotkeyAction = (code: string) => {
		if (PLAY_CODES.includes(code)) return onTogglePlay;
		if (code === SLOWER_CODE || code === FASTER_CODE) {
			return () =>
				onSpeedChange(
					CoachPlayback.speedStep(
						speed,
						code === FASTER_CODE ? "next" : "previous",
					),
				);
		}
		for (const { step, previous, next } of STEPS) {
			if (code === previous.code) return jumps[step].previous;
			if (code === next.code) return jumps[step].next;
		}
		return null;
	};

	return (
		<div className={styles.bar}>
			<div className={styles.controls}>
				<div className={clsx(styles.side, styles.previous)}>
					{STEPS.map(({ step, caption, previous }) => (
						<StepButton
							key={step}
							control={previous}
							caption={caption}
							onPress={jumps[step].previous}
						/>
					))}
				</div>
				<div className={styles.playColumn}>
					<button
						type="button"
						className={styles.play}
						aria-label={isPaused ? "Play" : "Pause"}
						aria-keyshortcuts="Space"
						title={`${isPaused ? "Play" : "Pause"} (Space)`}
						onClick={onTogglePlay}
					>
						{isPaused ? <Play /> : <Pause />}
					</button>
					<Keycaps keys={["Space"]} />
				</div>
				<div className={styles.side}>
					{STEPS.toReversed().map(({ step, caption, next }) => (
						<StepButton
							key={step}
							control={next}
							caption={caption}
							onPress={jumps[step].next}
						/>
					))}
					<div className={styles.speed}>
						<SendouMenu
							trigger={
								<button
									type="button"
									className={styles.control}
									aria-label={`Playback speed ${speed}×`}
									title="Playback speed (S slower, W faster)"
								>
									<span className={styles.speedValue}>{speed}×</span>
									<span className={styles.caption}>Speed</span>
									<Keycaps keys={["S", "W"]} />
								</button>
							}
							placement="bottom end"
						>
							{CoachPlayback.SPEEDS.map((option) => (
								<SendouMenuItem
									key={option}
									isActive={option === speed}
									onAction={() => onSpeedChange(option)}
								>
									{option}×
								</SendouMenuItem>
							))}
						</SendouMenu>
					</div>
				</div>
			</div>
		</div>
	);
}

function StepButton({
	control,
	caption,
	onPress,
}: {
	control: StepControl;
	caption: string;
	onPress: (() => void) | null;
}) {
	const Icon = control.icon;
	const key = control.code.replace("Key", "");

	return (
		<button
			type="button"
			className={styles.control}
			aria-label={control.label}
			aria-keyshortcuts={key}
			title={`${control.label} (${key})`}
			disabled={!onPress}
			onClick={onPress ?? undefined}
		>
			<Icon />
			<span className={styles.caption}>{caption}</span>
			<Keycaps keys={[key]} />
		</button>
	);
}

function Keycaps({ keys }: { keys: readonly string[] }) {
	return (
		<span className={styles.keycaps} aria-hidden>
			{keys.map((key) => (
				<kbd key={key} className={styles.keycap}>
					{key}
				</kbd>
			))}
		</span>
	);
}

/** A bare key press not meant for a field, menu or dialog that has focus. */
function isHotkey(event: KeyboardEvent): boolean {
	if (
		event.repeat ||
		event.defaultPrevented ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey
	) {
		return false;
	}

	const target = event.target;
	if (!(target instanceof HTMLElement)) return true;
	if (target.closest("[popover], dialog")) return false;
	if (
		target.isContentEditable ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	) {
		return false;
	}
	return (
		!(target instanceof HTMLInputElement) ||
		KEYLESS_INPUT_TYPES.has(target.type)
	);
}
