import { clsx } from "clsx";
import { Ban, Trophy as TrophyIcon } from "lucide-react";
import {
	type ColorScheme,
	PicoCAD2Context,
	PicoCAD2Viewer,
	type RenderStats,
} from "picocad2-web";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { TierPill } from "~/components/TierPill";
import { useTheme } from "~/features/theme/core/provider";
import { useLatestRef } from "~/hooks/useLatestRef";
import { usePrefersReducedMotion } from "~/hooks/usePrefersReducedMotion";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import * as XpTrophy from "../core/XpTrophy";
import { decompressTrophyModel, useXpTrophyState } from "../trophies-utils";
import style from "./Trophy.module.css";

type TrophyCtxValue =
	| { context: PicoCAD2Context }
	| { context: undefined; isLoading: true }
	| { context: undefined; isUnsupported: true };

const TrophyCtx = createContext<TrophyCtxValue | undefined>(undefined);

/**
 * Shares one PicoCAD2 WebGL context across every `Trophy`. Browsers cap active WebGL contexts at 16,
 * so big grids or rapid remounts with a context per trophy break rendering, and a context created
 * per mount loses its compiled shaders with every navigation. One page-wide singleton is held for
 * the page lifetime. A Trophy outside a provider uses it directly, and inside one descendants
 * render a spacer while it is loading instead of a canvas.
 */

/** `null` once creating it failed, e.g. the browser has WebGL 2 turned off */
let sharedContext: PicoCAD2Context | null | undefined;

// even a single frame blocks the main thread for seconds on software WebGL (e2e is always CPU),
// racing hydration and the test's own actions
const RENDERS_MODELS = !IS_E2E_TEST_RUN;

function getSharedTrophyContext() {
	if (typeof window === "undefined" || !RENDERS_MODELS) return undefined;
	if (sharedContext === undefined) sharedContext = createContextOrNull();
	return sharedContext ?? undefined;
}

function createContextOrNull() {
	try {
		return new PicoCAD2Context();
	} catch {
		return null;
	}
}

export function TrophyContextProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [value, setValue] = useState<TrophyCtxValue>({
		context: undefined,
		isLoading: true,
	});

	useEffect(() => {
		const context = getSharedTrophyContext();
		if (context) setValue({ context });
		else if (sharedContext === null) {
			setValue({ context: undefined, isUnsupported: true });
		}
	}, []);

	return <TrophyCtx.Provider value={value}>{children}</TrophyCtx.Provider>;
}

export function TrophyGrid({
	children,
	columns,
}: {
	children: React.ReactNode;
	columns?: number;
}) {
	return (
		<div
			className={style.grid}
			style={
				columns
					? ({ "--trophy-grid-columns": columns } as React.CSSProperties)
					: undefined
			}
		>
			{children}
		</div>
	);
}

export function Trophy({
	model,
	code,
	preview,
	paused,
	tier,
	tentativeTier,
	disableCameraControls,
	staticOnSoftwareRendering,
	pill,
	onRenderStats,
	colorScheme: forcedColorScheme,
	fps = 60,
	deferred,
	showAnimationProgress,
	showUnsupportedText,
}: {
	model: string;
	code?: string | null;
	preview?: boolean;
	/** Freezes on the current frame. Unlike toggling `preview`, keeps the viewer so the canvas never blanks. */
	paused?: boolean;
	tier?: number | null;
	tentativeTier?: number | null;
	disableCameraControls?: boolean;
	staticOnSoftwareRendering?: boolean;
	pill?: React.ReactNode;
	onRenderStats?: (stats: RenderStats) => void;
	colorScheme?: ColorScheme;
	fps?: number;
	deferred?: boolean;
	showAnimationProgress?: boolean;
	/** Spells out under the placeholder why the 3D model can't be shown, for views with room for it */
	showUnsupportedText?: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const ctxValue = useContext(TrophyCtx);
	const context = ctxValue?.context;
	const isLoadingSharedContext =
		ctxValue !== undefined && "isLoading" in ctxValue;
	const [viewerFailed, setViewerFailed] = useState(false);
	const isUnsupported =
		viewerFailed || (ctxValue !== undefined && "isUnsupported" in ctxValue);
	const viewerRef = useRef<PicoCAD2Viewer | null>(null);
	const [error, setError] = useState<boolean>(false);
	const [drawn, setDrawn] = useState(false);
	const [everDrawn, setEverDrawn] = useState(false);
	const [active, setActive] = useState({ model, code });
	const [hasAnimation, setHasAnimation] = useState(false);
	const animationProgressRef = useRef<HTMLDivElement>(null);
	const reducedMotion = usePrefersReducedMotion();

	const onRenderStatsRef = useLatestRef(onRenderStats);
	const reportsRenderStats = Boolean(onRenderStats);
	const pausedRef = useLatestRef(paused);

	useEffect(() => {
		const viewer = viewerRef.current;
		if (!viewer || !drawn) return;

		if (paused) viewer.stopRenderLoop();
		else viewer.startRenderLoop(false);
	}, [paused, drawn]);

	const [prevSource, setPrevSource] = useState({ model, code });
	if (prevSource.model !== model || prevSource.code !== code) {
		setPrevSource({ model, code });
		setError(false);
		if (!drawn || reducedMotion) setActive({ model, code });
		setDrawn(false);
	}

	const swapping = active.model !== model || active.code !== code;
	const xpVariant = XpTrophy.parseCode(active.code);
	const xpState = useXpTrophyState(xpVariant);
	const isLoadingXpState = xpVariant !== null && xpState === null;
	const modelState = xpVariant ? xpState : decompressTrophyModel(active.model);
	const siteColorScheme = useTrophyColorScheme();
	const colorScheme = forcedColorScheme ?? siteColorScheme;

	// stable ref callback identity, else React re-attaches and rebuilds the viewer every render
	const canvasRef = useCallback(
		(canvas: HTMLCanvasElement | null) => {
			if (!canvas) {
				viewerRef.current?.dispose();
				viewerRef.current = null;
				return;
			}

			if (modelState === null) return;

			const viewer = createViewerOrNull({
				canvas,
				context: context ?? getSharedTrophyContext(),
				colorScheme,
			});
			if (!viewer) {
				setViewerFailed(true);
				return;
			}
			viewerRef.current = viewer;

			try {
				viewer.setState(JSON.parse(modelState));
			} catch {
				setError(true);
				return;
			}

			configureViewer(viewer, fps);

			const presentFrame = (onPresented: () => void) => {
				if (viewerRef.current !== viewer) return;
				if (!viewer.draw()) {
					requestAnimationFrame(() => presentFrame(onPresented));
					return;
				}
				onPresented();
			};

			// render loops starve the main thread on software WebGL, so surfaces
			// showing many trophies without GPU acceleration draw a single static frame
			if (preview || (staticOnSoftwareRendering && isSoftwareRendering())) {
				viewer.whenReady().then(() =>
					presentFrame(() => {
						viewer.dispose();
						viewerRef.current = null;
						setDrawn(true);
						setEverDrawn(true);
					}),
				);
				return;
			}

			const animationDuration = viewer.modelInfo?.animationDuration ?? 0;
			const tracksAnimationProgress = Boolean(
				showAnimationProgress && animationDuration > 0,
			);
			setHasAnimation(tracksAnimationProgress);

			if ((context && reportsRenderStats) || tracksAnimationProgress) {
				setFrameListener(viewer, () => {
					if (context) onRenderStatsRef.current?.({ ...context.stats });
					animationProgressRef.current?.style.setProperty(
						"--animation-progress",
						String(viewer.animation.time / animationDuration),
					);
				});
			}

			const markDrawn = () => {
				setDrawn(true);
				setEverDrawn(true);
			};
			viewer.whenReady().then(() => {
				if (viewerRef.current !== viewer) return;
				if (pausedRef.current) {
					presentFrame(markDrawn);
					return;
				}
				viewer.startRenderLoop(false);
				markDrawn();
			});

			if (disableCameraControls) return;

			viewer.enableCameraControls({
				spinInertiaFactor: 0.95,
				pan: false,
				rotate: true,
				zoom: true,
				useFixedOnInteract: {
					enabled: true,
					delayBeforeRestore: 1000,
					restoreTime: 1000,
				},
			});
		},
		[
			modelState,
			context,
			preview,
			staticOnSoftwareRendering,
			disableCameraControls,
			colorScheme,
			fps,
			showAnimationProgress,
			reportsRenderStats,
			onRenderStatsRef,
			pausedRef,
		],
	);

	const effectiveTier = tier ?? tentativeTier ?? null;
	const containerStyle = effectiveTier
		? ({
				"--tier-bg": `var(--tier-bg-${effectiveTier})`,
				"--tier-text": `var(--tier-text-${effectiveTier})`,
			} as React.CSSProperties)
		: undefined;

	const tierPill = tier ? (
		<div className={style.tierPill}>
			<TierPill tier={tier} />
		</div>
	) : tentativeTier ? (
		<div className={style.tierPill}>
			<TierPill tier={tentativeTier} isTentative />
		</div>
	) : null;

	const cornerPill = pill ? (
		<div className={style.cornerPill} data-testid="trophy-corner-pill">
			{pill}
		</div>
	) : null;

	if (isUnsupported) {
		return (
			<div className={style.container} style={containerStyle}>
				<div
					className={clsx(
						style.trophy,
						style.error,
						style.unsupported,
						style.visible,
					)}
					role="img"
					aria-label={t("common:trophies.unsupported")}
					title={
						showUnsupportedText ? undefined : t("common:trophies.unsupported")
					}
				>
					<TrophyIcon size={48} />
					{showUnsupportedText ? (
						<p className={style.unsupportedText}>
							{t("common:trophies.unsupported")}
						</p>
					) : null}
				</div>
				{tierPill}
				{cornerPill}
			</div>
		);
	}

	if (error || (modelState === null && !isLoadingXpState)) {
		return (
			<div className={style.container} style={containerStyle}>
				<div className={clsx(style.trophy, style.error)}>
					<Ban size={48} />
				</div>
				{tierPill}
				{cornerPill}
			</div>
		);
	}

	return (
		<div className={style.container} style={containerStyle} aria-busy={!drawn}>
			{deferred ||
			isLoadingSharedContext ||
			isLoadingXpState ||
			!RENDERS_MODELS ? (
				<div className={style.trophy} />
			) : (
				<canvas
					ref={canvasRef}
					className={clsx(style.trophy, {
						[style.visible]: drawn,
						[style.interactive]: !preview && !disableCameraControls,
					})}
					onTransitionEnd={() => {
						if (swapping) setActive({ model, code });
					}}
				/>
			)}
			{hasAnimation ? (
				<div
					ref={animationProgressRef}
					className={style.animationProgress}
					data-testid="trophy-animation-progress"
				/>
			) : null}
			{everDrawn || swapping ? null : (
				<div className={style.loading}>
					<div className={style.spinner} />
				</div>
			)}
			{tierPill}
			{cornerPill}
		</div>
	);
}

function createViewerOrNull({
	canvas,
	context,
	colorScheme,
}: {
	canvas: HTMLCanvasElement;
	context: PicoCAD2Context | undefined;
	colorScheme: ColorScheme;
}) {
	// without a shared context the viewer would try to create its own, which already failed
	if (!context) return null;

	try {
		return new PicoCAD2Viewer({
			canvas,
			context,
			resolution: { width: 128, height: 128, scale: 4 },
			clampCameraDistance: {
				enabled: true,
				minimumDistance: 3,
			},
			colorScheme,
		});
	} catch {
		return null;
	}
}

function configureViewer(viewer: PicoCAD2Viewer, fps: number) {
	viewer.setResolution(128, 128, 4);
	viewer.leftTag = null;
	viewer.rightTag = null;
	viewer.animation.loop = true;
	viewer.animation.speed = 1;
	viewer.clampCameraDistance = { enabled: true, minimumDistance: 3 };
	viewer.maxFps = fps;
	viewer.cameraMode = "spin";
	viewer.cameraModeSpeed = 5;
	viewer.animation.setTime(0);
}

function setFrameListener(viewer: PicoCAD2Viewer, onFrame: () => void) {
	viewer.onFrame = onFrame;
}

function useTrophyColorScheme(): ColorScheme {
	const { userTheme, htmlThemeClass } = useTheme();
	if (userTheme === "auto") return "auto";

	return htmlThemeClass || "auto";
}

let softwareRenderingDetected: boolean | undefined;

function isSoftwareRendering() {
	if (softwareRenderingDetected !== undefined) return softwareRenderingDetected;
	if (typeof document === "undefined") return false;

	const gl = document
		.createElement("canvas")
		.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
	softwareRenderingDetected = !gl;
	gl?.getExtension("WEBGL_lose_context")?.loseContext();

	return softwareRenderingDetected;
}
