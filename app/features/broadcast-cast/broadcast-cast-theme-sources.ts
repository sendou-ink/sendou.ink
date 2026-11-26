import {
	BROADCAST_SHARED_SETTINGS,
	BROADCAST_THEME_SOURCES,
	themeDefaults,
} from "~/features/broadcast/broadcast-theme-sources";
import * as ThemeSettings from "~/features/broadcast/core/ThemeSettings";
import type { BROADCAST_THEME_STYLESHEETS } from "./broadcast-cast-constants";
import bracketSceneLayout from "./components/BracketScene.layout.module.css?raw";
import bracketScene from "./components/BracketScene.module.css?raw";
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
import nowPlayingLayout from "./components/NowPlaying.layout.module.css?raw";
import nowPlaying from "./components/NowPlaying.module.css?raw";
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
import teamSceneLayout from "./components/TeamScene.layout.module.css?raw";
import teamScene from "./components/TeamScene.module.css?raw";
import tickerLayout from "./components/Ticker.layout.module.css?raw";
import ticker from "./components/Ticker.module.css?raw";

type Stylesheet = (typeof BROADCAST_THEME_STYLESHEETS)[number];

const SOURCES: Record<Stylesheet, { look: string; layout: string }> = {
	BroadcastOverlay: BROADCAST_THEME_SOURCES.BroadcastOverlay,
	Stinger: { look: stinger, layout: stingerLayout },
	SceneBackdrop: { look: sceneBackdrop, layout: sceneBackdropLayout },
	TeamLogo: BROADCAST_THEME_SOURCES.TeamLogo,
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
	NowPlaying: { look: nowPlaying, layout: nowPlayingLayout },
};

/** The cast overlay's default styles as theme CSS by source, see `themeDefaults`. */
export const BROADCAST_THEME_DEFAULTS = themeDefaults(SOURCES);

/** Settings of each stylesheet: what its variable block at the top (its "sizes and spots") declares. */
export const BROADCAST_THEME_SETTINGS = Object.fromEntries(
	Object.entries(SOURCES).map(([stylesheet, { look }]) => [
		stylesheet,
		stylesheet === "BroadcastOverlay"
			? []
			: ThemeSettings.settingsOf({ source: look }),
	]),
) as Record<Stylesheet, ThemeSettings.ThemeSetting[]>;

/** Variable names of every setting of the cast overlay, the shared ones and each stylesheet's. */
export const BROADCAST_THEME_SETTING_NAMES: ReadonlySet<string> = new Set([
	...BROADCAST_SHARED_SETTINGS.flatMap(({ settings }) =>
		settings.map((setting) => setting.name),
	),
	...Object.values(BROADCAST_THEME_SETTINGS).flatMap((settings) =>
		settings.map((setting) => setting.name),
	),
]);
