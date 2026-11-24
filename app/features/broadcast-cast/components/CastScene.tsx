import type { BroadcastView } from "~/features/broadcast/broadcast-types";
import type {
	BroadcastSceneLayer,
	BroadcastSceneSet,
} from "~/features/broadcast/components/BroadcastOverlay";
import { useObsCaptureMute } from "../broadcast-cast-hooks";
import "../broadcast-cast-fonts.css";
import { CAST_THEME_CLASSES } from "../broadcast-cast-theme";
import type { CastBroadcastState } from "../broadcast-cast-types";
import { needsFeaturedMatch } from "../broadcast-cast-utils";
import { BracketScene } from "./BracketScene";
import { CasterCameras, CastersScene } from "./CastersScene";
import { GameScene } from "./GameScene";
import { HoldScene } from "./HoldScene";
import { MapsScene } from "./MapsScene";
import { MusicPlayer } from "./MusicPlayer";
import { ReplaysScene } from "./ReplaysScene";
import { ResultsScene } from "./ResultsScene";
import { RostersScene } from "./RostersScene";
import { Stinger } from "./Stinger";
import { TeamScene } from "./TeamScene";

/** The cast overlay's scenes as they register into `BroadcastOverlay`. */
export const CAST_SCENE_SET: BroadcastSceneSet<CastBroadcastState> = {
	Scene: CastScene,
	Stinger,
	Underlay: CastUnderlay,
	themeClasses: CAST_THEME_CLASSES,
};

/**
 * Under every scene: the casters' cameras (heard on every scene, seen on Casters), the music player, and the capture
 * card muted off the Game scene.
 */
function CastUnderlay({
	state,
	view,
	layers,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
	layers: BroadcastSceneLayer<CastBroadcastState>[];
}) {
	useObsCaptureMute(layers[0].state[view].scene === "game");

	return (
		<>
			<CasterCameras state={state} view={view} layers={layers} />
			<MusicPlayer state={state} view={view} />
		</>
	);
}

/**
 * A scene showing the featured match's teams falls back to the break scene while no match is cast, e.g. as it got
 * uncast on air. A scene this code doesn't know, e.g. added by a deploy the page predates, shows nothing.
 */
function CastScene({
	state,
	view,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
}) {
	const { scene, teamPick } = state[view];

	if (!state.match && needsFeaturedMatch(scene, teamPick)) {
		return <HoldScene scene="break" state={state} view={view} />;
	}

	switch (scene) {
		case "game":
			return <GameScene state={state} view={view} />;
		case "rosters":
			return <RostersScene state={state} view={view} />;
		case "maps":
			return <MapsScene state={state} view={view} />;
		case "casters":
			return <CastersScene state={state} view={view} />;
		case "results":
			return <ResultsScene state={state} view={view} />;
		case "replays":
			return <ReplaysScene state={state} view={view} />;
		case "bracket":
			return <BracketScene state={state} view={view} />;
		case "team":
			return <TeamScene state={state} view={view} />;
		case "starting":
		case "break":
		case "technical":
		case "ending":
			return <HoldScene scene={scene} state={state} view={view} />;
		default:
			return null;
	}
}
