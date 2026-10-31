import { useState } from "react";
import type {
	BroadcastScene,
	BroadcastState,
	BroadcastTransition,
	BroadcastView,
} from "../broadcast-types";
import { inkColorVars } from "../broadcast-utils";
import styles from "./BroadcastOverlay.module.css";
import { CastersScene } from "./CastersScene";
import { GameScene } from "./GameScene";
import { HoldScene } from "./HoldScene";
import { MapsScene } from "./MapsScene";
import { ReplaysScene } from "./ReplaysScene";
import { RostersScene } from "./RostersScene";
import { Stinger } from "./Stinger";

interface Stage {
	/** What changing makes the overlay transition: the Take on live, the staged scene on next. */
	cue: string;
	rehearsals: number;
	/** Last state rendered, what the outgoing scene keeps showing while it transitions out. */
	seen: BroadcastState;
	/** Id of the scene layer on screen, a new one mounts the scene again playing its entrance. */
	layerId: number;
	/** How the scene layer on screen came in, its entrance waits for a stinger to reveal it. */
	entrance: BroadcastTransition | null;
	/** Shown by the scene layer instead of the latest state until the stinger covers the screen. */
	frozen: BroadcastState | null;
	/** Scene layer fading out over the new one, still mounted as it was so its animations don't play again. */
	leaving: {
		layerId: number;
		state: BroadcastState;
		entrance: BroadcastTransition | null;
	} | null;
	/** Id the scene layer takes once the playing stinger covers the screen. */
	stingerId: number | null;
}

/**
 * The scene of the broadcast on the 1920×1080 canvas of an OBS browser source, the custom CSS applied on top.
 * A Take plays the transition it was made with: a cut, a crossfade or a stinger that covers the screen
 * with the upcoming match's info and changes the scene underneath while covered.
 */
export function BroadcastOverlay({
	state,
	view,
	rehearsals = 0,
}: {
	state: BroadcastState;
	/** What is on air or what is staged for the next Take. */
	view: BroadcastView;
	/** Bumping it plays the staged transition again without a Take, to preview it. */
	rehearsals?: number;
}) {
	const producer = state[view];
	const cue = view === "live" ? String(state.takeId) : producer.scene;
	const [stage, setStage] = useState<Stage>({
		cue,
		rehearsals,
		seen: state,
		layerId: 0,
		entrance: null,
		frozen: null,
		leaving: null,
		stingerId: null,
	});

	if (stage.cue !== cue || stage.rehearsals !== rehearsals) {
		// on next only a rehearsal plays the staged transition, a scene picked is just crossfaded to
		const transition =
			view === "live" || stage.rehearsals !== rehearsals
				? producer.transition
				: "fade";
		setStage(nextStage({ stage, state, view, cue, rehearsals, transition }));
	} else if (stage.seen !== state) {
		setStage({ ...stage, seen: state });
	}

	const shown = stage.frozen ?? state;
	const stingerId = stage.stingerId;

	return (
		<>
			<div
				className={styles.canvas}
				// the default tokens are sendou.ink's dark theme
				data-theme="dark"
				data-broadcast
			>
				{stage.leaving ? (
					<SceneLayer
						key={stage.leaving.layerId}
						state={stage.leaving.state}
						view={view}
						transition="out"
						entrance={stage.leaving.entrance}
						onTransitionDone={() =>
							setStage((current) => ({ ...current, leaving: null }))
						}
					/>
				) : null}
				<SceneLayer
					key={stage.layerId}
					state={shown}
					view={view}
					transition={stage.leaving ? "in" : undefined}
					entrance={stage.entrance}
				/>
				{stingerId !== null ? (
					<Stinger
						key={`stinger-${stingerId}`}
						design={state.settings.stinger}
						state={state}
						view={view}
						onCovered={() =>
							setStage((current) =>
								current.stingerId === stingerId && current.layerId !== stingerId
									? {
											...current,
											frozen: null,
											leaving: null,
											layerId: stingerId,
											entrance: "stinger",
										}
									: current,
							)
						}
						onDone={() =>
							setStage((current) =>
								current.stingerId === stingerId
									? { ...current, stingerId: null }
									: current,
							)
						}
					/>
				) : null}
			</div>
			{state.settings.css ? (
				// unlayered, so it beats the overlays' own (layered) styles without specificity fights
				<style>{escapeStyleText(state.settings.css)}</style>
			) : null}
		</>
	);
}

function nextStage({
	stage,
	state,
	view,
	cue,
	rehearsals,
	transition,
}: {
	stage: Stage;
	state: BroadcastState;
	view: BroadcastView;
	cue: string;
	rehearsals: number;
	transition: BroadcastTransition;
}): Stage {
	const base = { ...stage, cue, rehearsals, seen: state };
	const outgoing = stage.frozen ?? stage.seen;
	const nextId = Math.max(stage.layerId, stage.stingerId ?? 0) + 1;

	switch (transition) {
		case "stinger":
			// a stinger started before the last one covered the screen keeps the scene that was on air frozen
			return { ...base, frozen: outgoing, stingerId: nextId };
		case "fade":
			return {
				...base,
				frozen: null,
				leaving: {
					layerId: stage.layerId,
					state: outgoing,
					entrance: stage.entrance,
				},
				layerId: nextId,
				entrance: "fade",
				stingerId: null,
			};
		default: {
			const isSceneChanged = outgoing[view].scene !== state[view].scene;

			return {
				...base,
				frozen: null,
				leaving: null,
				// the scene staying on a cut stays mounted, only its values change
				layerId: isSceneChanged ? nextId : stage.layerId,
				entrance: isSceneChanged ? "cut" : stage.entrance,
				stingerId: null,
			};
		}
	}
}

function SceneLayer({
	state,
	view,
	transition,
	entrance,
	onTransitionDone,
}: {
	state: BroadcastState;
	view: BroadcastView;
	transition?: "in" | "out";
	entrance?: BroadcastTransition | null;
	onTransitionDone?: () => void;
}) {
	const scene = state[view].scene;

	return (
		<div
			className={styles.scene}
			style={inkColorVars(state[view])}
			data-scene={scene}
			data-transition={transition}
			data-entrance={entrance ?? undefined}
			onAnimationEnd={(event) => {
				if (event.target === event.currentTarget) onTransitionDone?.();
			}}
		>
			<Scene scene={scene} state={state} view={view} />
		</div>
	);
}

function Scene({
	scene,
	state,
	view,
}: {
	scene: BroadcastScene;
	state: BroadcastState;
	view: BroadcastView;
}) {
	switch (scene) {
		case "game":
			return <GameScene state={state} view={view} />;
		case "rosters":
			return <RostersScene state={state} view={view} />;
		case "maps":
			return <MapsScene state={state} view={view} />;
		case "casters":
			return <CastersScene state={state} view={view} />;
		case "replays":
			return <ReplaysScene state={state} view={view} />;
		default:
			return <HoldScene scene={scene} state={state} view={view} />;
	}
}

/** Keeps the text from closing the `<style>` element, `\3c` being `<` escaped in CSS. */
function escapeStyleText(css: string) {
	return css.replaceAll("<", "\\3c ");
}
