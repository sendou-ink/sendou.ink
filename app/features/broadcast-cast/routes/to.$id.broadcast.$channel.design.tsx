import clsx from "clsx";
import { ArrowLeft, Play, SquareArrowOutUpRight } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	BROADCAST_CSS_MAX_LENGTH,
	BROADCAST_DESIGN_MESSAGE,
	BROADCAST_DESIGN_READY_MESSAGE,
	BROADCAST_INK_COLORS,
} from "~/features/broadcast/broadcast-constants";
import type {
	BroadcastDesignMessage,
	BroadcastStingerVariant,
} from "~/features/broadcast/broadcast-types";
import {
	broadcastDashboardPage,
	broadcastDesignCanvasPage,
	broadcastDesignImageUrl,
} from "~/features/broadcast/broadcast-urls";
import { BroadcastPreview } from "~/features/broadcast/components/BroadcastPreview";
import { Choice } from "~/features/broadcast/components/Choice";
import {
	ThemeEditor,
	useThemeDraft,
} from "~/features/broadcast/components/ThemeEditor";
import { useTournament } from "~/features/tournament/tournament-context";
import { useUnsavedChangesChecker } from "~/form/UnsavedChangesGuard";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useLatestRef } from "~/hooks/useLatestRef";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { BROADCAST_OVERLAYS_DOC_LINK } from "~/utils/urls";
import {
	BROADCAST_DESIGN_BEST_OF,
	BROADCAST_DESIGN_BRACKET_FOCUSES,
	BROADCAST_DESIGN_BRACKETS,
	BROADCAST_DESIGN_FOOTAGE,
	BROADCAST_DESIGN_MAX_OTHER_MATCHES,
	BROADCAST_DESIGN_MAX_PLAYERS,
	BROADCAST_DESIGN_NAME_LENGTHS,
	BROADCAST_DESIGN_NOW_PLAYING,
	BROADCAST_DESIGN_SET_STAGES,
	BROADCAST_DESIGN_TRANSITIONS,
	BROADCAST_MAX_CASTERS,
	BROADCAST_THEME_FONTS,
	type BROADCAST_THEME_STYLESHEETS,
} from "../broadcast-cast-constants";
import { broadcastActionSchema } from "../broadcast-cast-schemas";
import { broadcastDesignSearchParams } from "../broadcast-cast-search-params";
import {
	BROADCAST_THEME_PRESETS,
	withPresetSettings,
} from "../broadcast-cast-theme-presets";
import {
	BROADCAST_THEME_DEFAULTS,
	BROADCAST_THEME_SETTINGS,
} from "../broadcast-cast-theme-sources";
import type { CastBroadcastState, CastScene } from "../broadcast-cast-types";
import { ScenePicker, useSceneHotkeys } from "../components/ScenePicker";
import * as DesignScenario from "../core/DesignScenario";
import { loader } from "../loaders/to.$id.broadcast.$channel.design.server";
import styles from "./to.$id.broadcast.$channel.design.module.css";

export { action } from "../actions/to.$id.broadcast.$channel.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["broadcast", "contributions"],
};

type Stylesheet = (typeof BROADCAST_THEME_STYLESHEETS)[number];

const HOLD_STYLESHEETS: Stylesheet[] = [
	"HoldScene",
	"Matchup",
	"Ticker",
	"NowPlaying",
	"SceneBackdrop",
];

/** The stylesheets each scene is drawn with, its own first: what the editor shows the settings and default CSS of. */
const SCENE_STYLESHEETS: Record<CastScene, Stylesheet[]> = {
	starting: HOLD_STYLESHEETS,
	casters: ["CastersScene", "Matchup", "NowPlaying", "SceneBackdrop"],
	rosters: ["RostersScene", "TeamLogo", "SceneBackdrop"],
	maps: ["MapsScene", "TeamLogo", "SceneBackdrop"],
	game: ["GameScene", "Ticker", "TeamLogo"],
	results: ["ResultsScene", "TeamLogo", "SceneBackdrop"],
	break: HOLD_STYLESHEETS,
	replays: ["ReplaysScene"],
	bracket: ["BracketScene", "TeamLogo", "SceneBackdrop"],
	team: ["TeamScene", "TeamLogo", "SceneBackdrop"],
	technical: HOLD_STYLESHEETS,
	ending: HOLD_STYLESHEETS,
};

/** Stylesheets of what shows over every scene, their settings with the ones of every scene. */
const EVERYWHERE_STYLESHEETS: Stylesheet[] = ["Stinger"];

/**
 * The overlays' theme laid out for editing, previewed live over a game feed screenshot in a mock scenario driven by
 * the search params (scene, name lengths, bracket type...): a preset to start from, settings of every scene and of the
 * scene previewed, and custom CSS for the rest.
 */
export default function BroadcastDesignPage() {
	const { t } = useTranslation(["broadcast", "common", "contributions"]);
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();
	const pageArgs = { tournamentId: tournament.ctx.id, slug: data.channel.slug };
	const [{ footage, ...scenario }, setScenario] = useSearchParamsTyped(
		broadcastDesignSearchParams,
	);
	const [savedTheme] = React.useState(() => withPresetSettings(data.settings));
	const { draft, setDraft, isChanged, hasErrors } = useThemeDraft(savedTheme);
	const [weaponImages, setWeaponImages] = React.useState(
		data.settings.weaponImages,
	);
	const [takenAt] = React.useState(() => Date.now());
	const [rehearsals, setRehearsals] = React.useState(0);
	const { submit, state: submitState } = useActionSubmit(
		broadcastActionSchema,
		{ encType: "application/json" },
	);

	const isDirty = isChanged || weaponImages !== data.settings.weaponImages;
	const isTooLong = draft.text.length > BROADCAST_CSS_MAX_LENGTH;
	useUnsavedChangesChecker(
		(navigation) =>
			isDirty &&
			// saving goes back to the dashboard
			submitState === "idle" &&
			(!navigation ||
				navigation.currentLocation.pathname !==
					navigation.nextLocation.pathname),
	);

	const isLogoBroken = useIsBrokenImage(data.tournament.logoUrl);
	const state = DesignScenario.build({
		scenario,
		tournament: isLogoBroken
			? { ...data.tournament, logoUrl: "" }
			: data.tournament,
		settings: {
			...data.settings,
			css: draft.css,
			variables: draft.variables,
			weaponImages,
		},
		takenAt,
	});

	useSceneHotkeys({
		selected: scenario.scene,
		onSelect: (scene) => setScenario({ scene }),
	});

	const save = () =>
		submit("UPDATE_THEME", {
			weaponImages,
			variables: draft.variables,
			css: draft.css || undefined,
		});

	const sceneStylesheets = SCENE_STYLESHEETS[scenario.scene];
	const settingsOf = (stylesheets: Stylesheet[]) =>
		stylesheets.flatMap((stylesheet) =>
			BROADCAST_THEME_SETTINGS[stylesheet].length > 0
				? [{ stylesheet, settings: BROADCAST_THEME_SETTINGS[stylesheet] }]
				: [],
		);

	return (
		<div className={clsx("stack lg", styles.designer)}>
			<header className="stack horizontal sm items-center justify-between flex-wrap">
				<div className="stack horizontal sm items-center">
					<Link
						to={broadcastDashboardPage(pageArgs)}
						className={styles.back}
						aria-label={t("broadcast:design.backToDashboard")}
						title={t("broadcast:design.backToDashboard")}
					>
						<ArrowLeft />
					</Link>
					<h1 className="text-lg">
						{t("broadcast:design.title")} · {data.channel.name}
					</h1>
				</div>
				<div className="stack horizontal sm items-center">
					<a
						href={BROADCAST_OVERLAYS_DOC_LINK}
						className={styles.guideLink}
						target="_blank"
						rel="noopener noreferrer"
					>
						{t("broadcast:design.guide")}
						<SquareArrowOutUpRight />
					</a>
					{isDirty ? (
						<span className="text-xs text-lighter">
							{t("broadcast:design.unsaved")}
						</span>
					) : null}
					<SendouButton
						onClick={save}
						isDisabled={
							!isDirty || hasErrors || isTooLong || submitState !== "idle"
						}
						testId="broadcast-design-save"
					>
						{t("common:actions.save")}
					</SendouButton>
				</div>
			</header>

			<div className={styles.workspace}>
				<section className="stack md">
					<DesignPreview
						src={broadcastDesignCanvasPage(pageArgs)}
						footageUrl={
							BROADCAST_DESIGN_FOOTAGE[footage]
								? broadcastDesignImageUrl(BROADCAST_DESIGN_FOOTAGE[footage])
								: null
						}
						state={state}
						rehearsals={rehearsals}
						stinger={DesignScenario.stingerOf(scenario)}
					/>
					<ScenePicker
						selected={scenario.scene}
						renderTile={(scene, tile) => (
							<SendouButton
								className={tile.className}
								onClick={() => setScenario({ scene })}
								testId={`broadcast-design-scene-${scene}`}
							>
								{tile.children}
							</SendouButton>
						)}
					/>
					<div className={styles.controls}>
						<Choice
							label={t("broadcast:dashboard.transition")}
							value={scenario.transition}
							options={BROADCAST_DESIGN_TRANSITIONS.map((transition) => ({
								value: transition,
								label: t(`broadcast:design.transition.${transition}`),
							}))}
							onChange={(transition) => setScenario({ transition })}
						/>
						<div className={styles.play}>
							<SendouButton
								variant="outlined"
								icon={<Play />}
								onClick={() => setRehearsals((count) => count + 1)}
							>
								{t("broadcast:design.playTransition")}
							</SendouButton>
						</div>
						<Choice
							label={t("broadcast:design.footage")}
							value={footage}
							options={(
								Object.keys(BROADCAST_DESIGN_FOOTAGE) as Array<
									keyof typeof BROADCAST_DESIGN_FOOTAGE
								>
							).map((key) => ({
								value: key,
								label: t(`broadcast:design.footage.${key}`),
							}))}
							onChange={(key) => setScenario({ footage: key })}
						/>
					</div>
					<ScenarioControls scenario={scenario} setScenario={setScenario} />
				</section>

				<ThemeEditor
					presets={BROADCAST_THEME_PRESETS.map((preset) => ({
						key: preset.key,
						css: preset.css,
						variables: preset.variables,
						label: t(`broadcast:design.preset.${preset.key}`),
					}))}
					draft={draft}
					setDraft={setDraft}
					weaponImages={weaponImages}
					setWeaponImages={setWeaponImages}
					everywhereSettings={settingsOf(EVERYWHERE_STYLESHEETS)}
					sceneLabel={t(`broadcast:scene.${scenario.scene}`)}
					sceneSettings={settingsOf(sceneStylesheets)}
					sceneDefaultCss={defaultCssOf(sceneStylesheets)}
					fonts={BROADCAST_THEME_FONTS}
					isTooLong={isTooLong}
				/>
			</div>

			<footer className="stack xs text-xs text-lighter">
				<span>aza & marcus - {t("contributions:stageVideos")}</span>
				<span>ely - {t("contributions:ely")}</span>
			</footer>
		</div>
	);
}

/** Whether the image fails to load, e.g. a logo whose file is gone, so the mock can stand in for it. */
function useIsBrokenImage(url: string) {
	const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);

	React.useEffect(() => {
		const image = new Image();
		image.onerror = () => setBrokenUrl(url);
		image.src = url;

		return () => {
			image.onerror = null;
		};
	}, [url]);

	return brokenUrl === url;
}

/** The overlay over the footage screenshot, rendering the state posted to it. */
function DesignPreview({
	src,
	footageUrl,
	state,
	rehearsals,
	stinger,
}: {
	src: string;
	footageUrl: string | null;
	state: CastBroadcastState;
	rehearsals: number;
	stinger: BroadcastStingerVariant;
}) {
	const { t } = useTranslation(["broadcast"]);
	const iframeRef = React.useRef<HTMLIFrameElement>(null);
	const latest = useLatestRef({ state, rehearsals, stinger });

	React.useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const iframeWindow = iframeRef.current?.contentWindow;
			if (
				!iframeWindow ||
				event.source !== iframeWindow ||
				event.origin !== window.location.origin ||
				event.data?.type !== BROADCAST_DESIGN_READY_MESSAGE
			) {
				return;
			}

			postDesign(iframeWindow, latest.current);
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [latest]);

	React.useEffect(() => {
		const iframeWindow = iframeRef.current?.contentWindow;
		if (iframeWindow) postDesign(iframeWindow, { state, rehearsals, stinger });
	}, [state, rehearsals, stinger]);

	return (
		<BroadcastPreview
			iframeRef={iframeRef}
			src={src}
			title={t("broadcast:design.title")}
			footageUrl={footageUrl}
		/>
	);
}

function postDesign(
	iframeWindow: Window,
	{
		state,
		rehearsals,
		stinger,
	}: Pick<BroadcastDesignMessage, "state" | "rehearsals" | "stinger">,
) {
	const message: BroadcastDesignMessage = {
		type: BROADCAST_DESIGN_MESSAGE,
		state,
		rehearsals,
		stinger,
	};

	iframeWindow.postMessage(message, window.location.origin);
}

/** The default styles of the stylesheets as theme CSS, each one's look followed by its layout and motion. */
function defaultCssOf(stylesheets: Stylesheet[]) {
	return stylesheets
		.flatMap((stylesheet) => [
			`/* ${stylesheet} */\n\n${BROADCAST_THEME_DEFAULTS[stylesheet].trim()}`,
			`/* ${stylesheet}: layout and motion */\n\n${BROADCAST_THEME_DEFAULTS[`${stylesheet}.layout`].trim()}`,
		])
		.join("\n\n");
}

function ScenarioControls({
	scenario,
	setScenario,
}: {
	scenario: DesignScenario.Scenario;
	setScenario: (values: Partial<DesignScenario.Scenario>) => void;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<fieldset className={styles.scenario}>
			<legend className="text-sm font-semi-bold">
				{t("broadcast:design.scenario")}
			</legend>
			<div className={styles.controls}>
				<Choice
					label={t("broadcast:design.names")}
					value={scenario.names}
					options={BROADCAST_DESIGN_NAME_LENGTHS.map((names) => ({
						value: names,
						label: t(`broadcast:design.names.${names}`),
					}))}
					onChange={(names) => setScenario({ names })}
				/>
				<Choice
					label={t("broadcast:design.set")}
					value={scenario.set}
					options={BROADCAST_DESIGN_SET_STAGES.map((set) => ({
						value: set,
						label: t(`broadcast:design.set.${set}`),
					}))}
					onChange={(set) => setScenario({ set })}
				/>
				<Choice
					label={t("broadcast:design.bestOf")}
					value={scenario.bestOf}
					options={BROADCAST_DESIGN_BEST_OF.map((bestOf) => ({
						value: bestOf,
						label: t("broadcast:overlay.bestOf", { count: bestOf }),
					}))}
					onChange={(bestOf) => setScenario({ bestOf })}
				/>
				<Choice
					label={t("broadcast:design.ink")}
					value={scenario.ink ?? "theme"}
					options={[
						{ value: "theme", label: t("broadcast:design.ink.theme") },
						...BROADCAST_INK_COLORS.map((color) => ({
							value: color.key,
							label: t(`broadcast:ink.${color.key}`),
						})),
					]}
					onChange={(ink) => setScenario({ ink: ink === "theme" ? null : ink })}
				/>
				<Choice
					label={t("broadcast:design.players")}
					value={scenario.players}
					options={countOptions({ min: 1, max: BROADCAST_DESIGN_MAX_PLAYERS })}
					onChange={(players) => setScenario({ players })}
				/>
				<Choice
					label={t("broadcast:design.casters")}
					value={scenario.casters}
					options={countOptions({ max: BROADCAST_MAX_CASTERS })}
					onChange={(casters) => setScenario({ casters })}
				/>
				<Choice
					label={t("broadcast:design.otherMatches")}
					value={scenario.otherMatches}
					options={countOptions({ max: BROADCAST_DESIGN_MAX_OTHER_MATCHES })}
					onChange={(otherMatches) => setScenario({ otherMatches })}
				/>
				<Choice
					label={t("broadcast:design.nowPlaying")}
					value={scenario.nowPlaying}
					options={BROADCAST_DESIGN_NOW_PLAYING.map((nowPlaying) => ({
						value: nowPlaying,
						label: t(`broadcast:design.nowPlaying.${nowPlaying}`),
					}))}
					onChange={(nowPlaying) => setScenario({ nowPlaying })}
				/>
				<Choice
					label={t("broadcast:design.bracket")}
					value={scenario.bracket}
					options={BROADCAST_DESIGN_BRACKETS.map((bracket) => ({
						value: bracket,
						label: t(`broadcast:design.bracket.${bracket}`),
					}))}
					onChange={(bracket) => setScenario({ bracket })}
				/>
				<Choice
					label={t("broadcast:dashboard.bracket.focus")}
					value={scenario.bracketFocus}
					options={BROADCAST_DESIGN_BRACKET_FOCUSES.map((bracketFocus) => ({
						value: bracketFocus,
						label: t(`broadcast:bracketFocus.${bracketFocus}`),
					}))}
					onChange={(bracketFocus) => setScenario({ bracketFocus })}
				/>
			</div>
			<div className={styles.switches}>
				<SendouSwitch
					isSelected={scenario.swapSides}
					onChange={(swapSides) => setScenario({ swapSides })}
				>
					{t("broadcast:design.swapSides")}
				</SendouSwitch>
				<SendouSwitch
					isSelected={scenario.seeds}
					onChange={(seeds) => setScenario({ seeds })}
				>
					{t("broadcast:design.seeds")}
				</SendouSwitch>
				<SendouSwitch
					isSelected={scenario.logos}
					onChange={(logos) => setScenario({ logos })}
				>
					{t("broadcast:design.logos")}
				</SendouSwitch>
				<SendouSwitch
					isSelected={scenario.placeholderLogos}
					onChange={(placeholderLogos) => setScenario({ placeholderLogos })}
					isDisabled={!scenario.logos}
				>
					{t("broadcast:design.placeholderLogos")}
				</SendouSwitch>
				<SendouSwitch
					isSelected={scenario.headline}
					onChange={(headline) => setScenario({ headline })}
				>
					{t("broadcast:design.headline")}
				</SendouSwitch>
			</div>
		</fieldset>
	);
}

function countOptions({ min = 0, max }: { min?: number; max: number }) {
	return Array.from({ length: max - min + 1 }, (_, i) => ({
		value: min + i,
		label: String(min + i),
	}));
}
