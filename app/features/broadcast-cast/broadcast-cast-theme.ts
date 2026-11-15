import { BROADCAST_THEME_CLASSES } from "~/features/broadcast/broadcast-theme";
import { combineStyles } from "~/features/broadcast/broadcast-utils";
import type { BROADCAST_THEME_STYLESHEETS } from "./broadcast-cast-constants";
import bracketSceneLayout from "./components/BracketScene.layout.module.css";
import bracketScene from "./components/BracketScene.module.css";
import castersSceneLayout from "./components/CastersScene.layout.module.css";
import castersScene from "./components/CastersScene.module.css";
import gameSceneLayout from "./components/GameScene.layout.module.css";
import gameScene from "./components/GameScene.module.css";
import holdSceneLayout from "./components/HoldScene.layout.module.css";
import holdScene from "./components/HoldScene.module.css";
import mapsSceneLayout from "./components/MapsScene.layout.module.css";
import mapsScene from "./components/MapsScene.module.css";
import matchupLayout from "./components/Matchup.layout.module.css";
import matchup from "./components/Matchup.module.css";
import replaysSceneLayout from "./components/ReplaysScene.layout.module.css";
import replaysScene from "./components/ReplaysScene.module.css";
import resultsSceneLayout from "./components/ResultsScene.layout.module.css";
import resultsScene from "./components/ResultsScene.module.css";
import rostersSceneLayout from "./components/RostersScene.layout.module.css";
import rostersScene from "./components/RostersScene.module.css";
import sceneBackdropLayout from "./components/SceneBackdrop.layout.module.css";
import sceneBackdrop from "./components/SceneBackdrop.module.css";
import stingerLayout from "./components/Stinger.layout.module.css";
import stinger from "./components/Stinger.module.css";
import teamSceneLayout from "./components/TeamScene.layout.module.css";
import teamScene from "./components/TeamScene.module.css";
import tickerLayout from "./components/Ticker.layout.module.css";
import ticker from "./components/Ticker.module.css";

/** Classes of the cast overlay's theme stylesheets, see `BroadcastThemeClasses`. */
export const CAST_THEME_CLASSES: Record<
	(typeof BROADCAST_THEME_STYLESHEETS)[number],
	Record<string, string>
> = {
	BroadcastOverlay: BROADCAST_THEME_CLASSES.BroadcastOverlay,
	Stinger: combineStyles(stinger, stingerLayout),
	SceneBackdrop: combineStyles(sceneBackdrop, sceneBackdropLayout),
	TeamLogo: BROADCAST_THEME_CLASSES.TeamLogo,
	Matchup: combineStyles(matchup, matchupLayout),
	Ticker: combineStyles(ticker, tickerLayout),
	GameScene: combineStyles(gameScene, gameSceneLayout),
	RostersScene: combineStyles(rostersScene, rostersSceneLayout),
	MapsScene: combineStyles(mapsScene, mapsSceneLayout),
	ResultsScene: combineStyles(resultsScene, resultsSceneLayout),
	ReplaysScene: combineStyles(replaysScene, replaysSceneLayout),
	CastersScene: combineStyles(castersScene, castersSceneLayout),
	BracketScene: combineStyles(bracketScene, bracketSceneLayout),
	TeamScene: combineStyles(teamScene, teamSceneLayout),
	HoldScene: combineStyles(holdScene, holdSceneLayout),
};
