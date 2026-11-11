import type { BroadcastView } from "~/features/broadcast/broadcast-types";
import type { BroadcastSceneSet } from "~/features/broadcast/components/BroadcastOverlay";
import { CAST_THEME_CLASSES } from "../broadcast-cast-theme";
import type { CastBroadcastState } from "../broadcast-cast-types";
import { needsFeaturedMatch } from "../broadcast-cast-utils";
import { BracketScene } from "./BracketScene";
import { CastersScene } from "./CastersScene";
import { GameScene } from "./GameScene";
import { HoldScene } from "./HoldScene";
import { MapsScene } from "./MapsScene";
import { ReplaysScene } from "./ReplaysScene";
import { ResultsScene } from "./ResultsScene";
import { RostersScene } from "./RostersScene";
import { Stinger } from "./Stinger";
import { TeamScene } from "./TeamScene";

/** The cast overlay's scenes as they register into `BroadcastOverlay`. */
export const CAST_SCENE_SET: BroadcastSceneSet<CastBroadcastState> = {
	Scene: CastScene,
	Stinger,
	themeClasses: CAST_THEME_CLASSES,
};

/** A scene showing the featured match's teams falls back to the break scene while no match is cast, e.g. as it got uncast on air. */
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
		default:
			return <HoldScene scene={scene} state={state} view={view} />;
	}
}
