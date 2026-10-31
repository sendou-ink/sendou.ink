import { useState } from "react";
import type {
	BroadcastScene,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import styles from "./BroadcastOverlay.module.css";
import { GameScene } from "./GameScene";
import { RostersScene } from "./RostersScene";

/**
 * The scene of the broadcast on the 1920×1080 canvas of an OBS browser source, the custom CSS applied on top.
 * When the scene changes the new one fades in over the old one.
 */
export function BroadcastOverlay({
	state,
	view,
}: {
	state: BroadcastState;
	/** What is on air or what is staged for the next Take. */
	view: BroadcastView;
}) {
	const scene = state[view].scene;
	const [scenes, setScenes] = useState<{
		shown: BroadcastScene;
		leaving: BroadcastScene | null;
	}>({ shown: scene, leaving: null });

	if (scenes.shown !== scene) {
		setScenes({ shown: scene, leaving: scenes.shown });
	}

	return (
		<>
			<div className={styles.canvas}>
				{scenes.leaving ? (
					<SceneLayer
						key={scenes.leaving}
						scene={scenes.leaving}
						transition="out"
						state={state}
						view={view}
						onTransitionDone={() =>
							setScenes((current) => ({ ...current, leaving: null }))
						}
					/>
				) : null}
				<SceneLayer
					key={scenes.shown}
					scene={scenes.shown}
					transition={scenes.leaving ? "in" : undefined}
					state={state}
					view={view}
				/>
			</div>
			{state.settings.css ? (
				// unlayered, so it beats the overlays' own (layered) styles without specificity fights
				<style>{escapeStyleText(state.settings.css)}</style>
			) : null}
		</>
	);
}

function SceneLayer({
	scene,
	transition,
	state,
	view,
	onTransitionDone,
}: {
	scene: BroadcastScene;
	transition?: "in" | "out";
	state: BroadcastState;
	view: BroadcastView;
	onTransitionDone?: () => void;
}) {
	return (
		<div
			className={styles.scene}
			data-scene={scene}
			data-transition={transition}
			onAnimationEnd={(event) => {
				if (event.target === event.currentTarget) onTransitionDone?.();
			}}
		>
			{scene === "rosters" ? (
				<RostersScene state={state} view={view} />
			) : (
				// the other scenes are not designed yet
				<GameScene state={state} view={view} />
			)}
		</div>
	);
}

/** Keeps the text from closing the `<style>` element, `\3c` being `<` escaped in CSS. */
function escapeStyleText(css: string) {
	return css.replaceAll("<", "\\3c ");
}
