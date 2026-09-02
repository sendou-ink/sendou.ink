import { clsx } from "clsx";
import { Ban } from "lucide-react";
import {
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
import { TierPill } from "~/components/TierPill";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { decompressTrophyModel } from "../trophies-utils";
import style from "./Trophy.module.css";

type TrophyCtxValue =
	| { context: PicoCAD2Context }
	| { context: undefined; isLoading: true };

const TrophyCtx = createContext<TrophyCtxValue | undefined>(undefined);

/**
 * Shares one PicoCAD2 WebGL context across every `Trophy` inside. Without a provider each `Trophy`
 * creates its own, but browsers cap active WebGL contexts at 16, so big grids or rapid remounts
 * break rendering. One page-wide singleton is held for the page lifetime (per-mount contexts stack
 * faster than the browser frees them), and while it is loading descendants render a spacer instead
 * of a canvas that would create their own context.
 */

let sharedContext: PicoCAD2Context | undefined;

function getSharedTrophyContext() {
	if (typeof window === "undefined") return undefined;
	if (!sharedContext) sharedContext = new PicoCAD2Context();
	return sharedContext;
}

export function TrophyContextProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [context, setContext] = useState<PicoCAD2Context | undefined>();

	useEffect(() => {
		setContext(getSharedTrophyContext());
	}, []);

	const value: TrophyCtxValue = context
		? { context }
		: { context: undefined, isLoading: true };

	return <TrophyCtx.Provider value={value}>{children}</TrophyCtx.Provider>;
}

export function TrophyGrid({ children }: { children: React.ReactNode }) {
	return <div className={style.grid}>{children}</div>;
}

export function TrophyPlaceholder() {
	return <div className={style.placeholder} />;
}

export function Trophy({
	model,
	className,
	preview,
	tile,
	tier,
	tentativeTier,
	disableCameraControls,
	staticOnSoftwareRendering,
	pill,
	onRenderStats,
}: {
	model: string;
	className?: string;
	preview?: boolean;
	tile?: boolean;
	tier?: number | null;
	tentativeTier?: number | null;
	disableCameraControls?: boolean;
	staticOnSoftwareRendering?: boolean;
	pill?: React.ReactNode;
	onRenderStats?: (stats: RenderStats) => void;
}) {
	const ctxValue = useContext(TrophyCtx);
	const context = ctxValue?.context;
	const isLoadingSharedContext =
		ctxValue !== undefined && ctxValue.context === undefined;
	const viewerRef = useRef<PicoCAD2Viewer | null>(null);
	const [error, setError] = useState<boolean>(false);

	const onRenderStatsRef = useRef(onRenderStats);
	onRenderStatsRef.current = onRenderStats;

	const prevModelRef = useRef(model);
	if (prevModelRef.current !== model) {
		prevModelRef.current = model;
		setError(false);
	}

	const modelState = decompressTrophyModel(model);

	// stable ref callback identity, else React re-attaches and rebuilds the viewer every render
	const canvasRef = useCallback(
		(canvas: HTMLCanvasElement | null) => {
			if (!canvas) {
				viewerRef.current?.dispose();
				viewerRef.current = null;
				return;
			}

			if (modelState === null) return;

			const viewer = new PicoCAD2Viewer({
				canvas,
				context,
				resolution: { width: 128, height: 128, scale: 4 },
			});
			viewerRef.current = viewer;

			try {
				viewer.setState(JSON.parse(modelState));
			} catch (_) {
				setError(true);
				return;
			}

			// render loops starve the main thread on software WebGL, so e2e (always CPU) and surfaces
			// showing many trophies without GPU acceleration draw a single static frame
			if (
				preview ||
				IS_E2E_TEST_RUN ||
				(staticOnSoftwareRendering && isSoftwareRendering())
			) {
				viewer.draw();
				viewer.dispose();
				return;
			}

			if (context && onRenderStats) {
				viewer.onFrame = () => {
					onRenderStatsRef.current?.({ ...context.stats });
				};
			}

			viewer.cameraMode = "spin";
			viewer.cameraModeSpeed = 5;
			viewer.animation.setTime(0);
			viewer.startRenderLoop(false);

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
		],
	);

	const effectiveTier = tier ?? tentativeTier ?? null;
	const containerClassName = clsx(style.container, className, {
		[style.tile]: tile,
	});
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

	if (error || modelState === null) {
		return (
			<div className={containerClassName} style={containerStyle}>
				<div className={clsx(style.trophy, style.error)}>
					<Ban size={48} />
				</div>
				{tierPill}
				{cornerPill}
			</div>
		);
	}

	if (isLoadingSharedContext) {
		return (
			<div className={containerClassName} style={containerStyle}>
				<div className={style.trophy} />
			</div>
		);
	}

	return (
		<div className={containerClassName} style={containerStyle}>
			<canvas
				ref={canvasRef}
				className={clsx(style.trophy, {
					[style.interactive]: !preview && !disableCameraControls,
				})}
			/>
			{tierPill}
			{cornerPill}
		</div>
	);
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
