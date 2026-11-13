import type * as React from "react";
import { useState } from "react";
import {
	type BroadcastThemeClasses,
	resolveThemeClasses,
} from "../broadcast-theme";
import type {
	BroadcastState,
	BroadcastTransition,
	BroadcastView,
} from "../broadcast-types";
import { combineStyles } from "../broadcast-utils";
import layout from "./BroadcastOverlay.layout.module.css";
import look from "./BroadcastOverlay.module.css";

const styles = combineStyles(look, layout);

/** What a scene set registers into the overlay: how it draws its scenes and the stinger over them, and its theme stylesheets. */
export interface BroadcastSceneSet<State extends BroadcastState> {
	/** Draws the scene of the view, `state[view].scene`. */
	Scene: React.ComponentType<{ state: State; view: BroadcastView }>;
	/**
	 * Covers the screen as a stinger Take plays, the scene underneath changing once it calls `onCovered`. Calls
	 * `onDone` once it has revealed the new scene.
	 */
	Stinger: React.ComponentType<{
		state: State;
		view: BroadcastView;
		onCovered: () => void;
		onDone: () => void;
	}>;
	/** Classes of its stylesheets, which the custom CSS refers to as `.{stylesheet}-{class}`. */
	themeClasses: BroadcastThemeClasses;
}

interface Stage<State extends BroadcastState> {
	/** What changing makes the overlay transition: the Take on live, the staged scene on next. */
	cue: string;
	rehearsals: number;
	/** Last state rendered, what the outgoing scene keeps showing while it transitions out. */
	seen: State;
	/** Id of the scene layer on screen, a new one mounts the scene again playing its entrance. */
	layerId: number;
	/** How the scene layer on screen came in, its entrance waits for a stinger to reveal it. */
	entrance: BroadcastTransition | null;
	/** Shown by the scene layer instead of the latest state until the stinger covers the screen. */
	frozen: State | null;
	/** Scene layer fading out over the new one, still mounted as it was so its animations don't play again. */
	leaving: {
		layerId: number;
		state: State;
		entrance: BroadcastTransition | null;
	} | null;
	/** Id the scene layer takes once the playing stinger covers the screen. */
	stingerId: number | null;
}

/**
 * The scene of the broadcast on the 1920×1080 canvas of an OBS browser source, drawn by the scene set, the custom CSS
 * applied on top. A Take plays the transition it was made with: a cut, a crossfade or the scene set's stinger that
 * covers the screen and changes the scene underneath while covered.
 */
export function BroadcastOverlay<State extends BroadcastState>({
	sceneSet,
	state,
	view,
	rehearsals = 0,
}: {
	sceneSet: BroadcastSceneSet<State>;
	state: State;
	/** What is on air or what is staged for the next Take. */
	view: BroadcastView;
	/** Bumping it plays the staged transition again without a Take, to preview it. */
	rehearsals?: number;
}) {
	const producer = state[view];
	const cue = view === "live" ? String(state.takeId) : producer.scene;
	const [stage, setStage] = useState<Stage<State>>({
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
	const { Scene, Stinger } = sceneSet;

	return (
		<>
			<div
				className={styles.canvas}
				// sendou.ink's own components in the scenes follow its dark theme, as the overlay's tokens do
				data-theme="dark"
				data-broadcast
			>
				{stage.leaving ? (
					<SceneLayer
						key={stage.leaving.layerId}
						Scene={Scene}
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
					Scene={Scene}
					state={shown}
					view={view}
					transition={stage.leaving ? "in" : undefined}
					entrance={stage.entrance}
				/>
				{stingerId !== null ? (
					<Stinger
						key={`stinger-${stingerId}`}
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
				<style>
					{escapeStyleText(
						resolveThemeClasses(state.settings.css, sceneSet.themeClasses),
					)}
				</style>
			) : null}
		</>
	);
}

function nextStage<State extends BroadcastState>({
	stage,
	state,
	view,
	cue,
	rehearsals,
	transition,
}: {
	stage: Stage<State>;
	state: State;
	view: BroadcastView;
	cue: string;
	rehearsals: number;
	transition: BroadcastTransition;
}): Stage<State> {
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

function SceneLayer<State extends BroadcastState>({
	Scene,
	state,
	view,
	transition,
	entrance,
	onTransitionDone,
}: {
	Scene: BroadcastSceneSet<State>["Scene"];
	state: State;
	view: BroadcastView;
	transition?: "in" | "out";
	entrance?: BroadcastTransition | null;
	onTransitionDone?: () => void;
}) {
	const scene = state[view].scene;

	return (
		<div
			className={styles.scene}
			data-scene={scene}
			data-transition={transition}
			data-entrance={entrance ?? undefined}
			onAnimationEnd={(event) => {
				if (event.target === event.currentTarget) onTransitionDone?.();
			}}
		>
			<Scene state={state} view={view} />
		</div>
	);
}

/** Keeps the text from closing the `<style>` element, `\3c` being `<` escaped in CSS. */
function escapeStyleText(css: string) {
	return css.replaceAll("<", "\\3c ");
}
