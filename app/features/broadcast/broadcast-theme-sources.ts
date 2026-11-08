import type { BROADCAST_THEME_STYLESHEETS } from "./broadcast-constants";
import bracketSceneLayout from "./components/BracketScene.layout.module.css?raw";
import bracketScene from "./components/BracketScene.module.css?raw";
import broadcastOverlayLayout from "./components/BroadcastOverlay.layout.module.css?raw";
import broadcastOverlay from "./components/BroadcastOverlay.module.css?raw";
import castersSceneLayout from "./components/CastersScene.layout.module.css?raw";
import castersScene from "./components/CastersScene.module.css?raw";
import gameSceneLayout from "./components/GameScene.layout.module.css?raw";
import gameScene from "./components/GameScene.module.css?raw";
import holdSceneLayout from "./components/HoldScene.layout.module.css?raw";
import holdScene from "./components/HoldScene.module.css?raw";
import mapsSceneLayout from "./components/MapsScene.layout.module.css?raw";
import mapsScene from "./components/MapsScene.module.css?raw";
import matchupLayout from "./components/Matchup.layout.module.css?raw";
import matchup from "./components/Matchup.module.css?raw";
import replaysSceneLayout from "./components/ReplaysScene.layout.module.css?raw";
import replaysScene from "./components/ReplaysScene.module.css?raw";
import resultsSceneLayout from "./components/ResultsScene.layout.module.css?raw";
import resultsScene from "./components/ResultsScene.module.css?raw";
import rostersSceneLayout from "./components/RostersScene.layout.module.css?raw";
import rostersScene from "./components/RostersScene.module.css?raw";
import sceneBackdropLayout from "./components/SceneBackdrop.layout.module.css?raw";
import sceneBackdrop from "./components/SceneBackdrop.module.css?raw";
import stingerLayout from "./components/Stinger.layout.module.css?raw";
import stinger from "./components/Stinger.module.css?raw";
import teamLogoLayout from "./components/TeamLogo.layout.module.css?raw";
import teamLogo from "./components/TeamLogo.module.css?raw";
import teamSceneLayout from "./components/TeamScene.layout.module.css?raw";
import teamScene from "./components/TeamScene.module.css?raw";
import tickerLayout from "./components/Ticker.layout.module.css?raw";
import ticker from "./components/Ticker.module.css?raw";
import * as ThemeCss from "./core/ThemeCss";

type Stylesheet = (typeof BROADCAST_THEME_STYLESHEETS)[number];

/**
 * A stylesheet's look (`X.module.css`: its sizes and spots, colors and type) or its layout and motion
 * (`X.layout.module.css`).
 */
export type BroadcastThemeSource = Stylesheet | `${Stylesheet}.layout`;

const SOURCES: Record<Stylesheet, { look: string; layout: string }> = {
	BroadcastOverlay: { look: broadcastOverlay, layout: broadcastOverlayLayout },
	Stinger: { look: stinger, layout: stingerLayout },
	SceneBackdrop: { look: sceneBackdrop, layout: sceneBackdropLayout },
	TeamLogo: { look: teamLogo, layout: teamLogoLayout },
	Matchup: { look: matchup, layout: matchupLayout },
	Ticker: { look: ticker, layout: tickerLayout },
	GameScene: { look: gameScene, layout: gameSceneLayout },
	RostersScene: { look: rostersScene, layout: rostersSceneLayout },
	MapsScene: { look: mapsScene, layout: mapsSceneLayout },
	ResultsScene: { look: resultsScene, layout: resultsSceneLayout },
	ReplaysScene: { look: replaysScene, layout: replaysSceneLayout },
	CastersScene: { look: castersScene, layout: castersSceneLayout },
	BracketScene: { look: bracketScene, layout: bracketSceneLayout },
	TeamScene: { look: teamScene, layout: teamSceneLayout },
	HoldScene: { look: holdScene, layout: holdSceneLayout },
};

/** The overlays' default styles as theme CSS by source, the base the designer's edits are diffed against. */
export const BROADCAST_THEME_DEFAULTS = Object.fromEntries(
	Object.entries(SOURCES).flatMap(([stylesheet, { look, layout }]) => [
		[stylesheet, ThemeCss.fromModuleSource({ source: look, stylesheet })],
		[
			`${stylesheet}.layout`,
			ThemeCss.fromModuleSource({ source: layout, stylesheet }),
		],
	]),
) as Record<BroadcastThemeSource, string>;
