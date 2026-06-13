import { clsx } from "clsx";
import { Ban } from "lucide-react";
import { PicoCAD2Context, PicoCAD2Viewer } from "picocad2-web";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { TierPill } from "~/components/TierPill";
import { decompressTrophyModel } from "../trophies-utils";
import style from "./Trophy.module.css";

type TrophyCtxValue =
	| { context: PicoCAD2Context }
	| { context: undefined; isLoading: true };

const TrophyCtx = createContext<TrophyCtxValue | undefined>(undefined);

/**
 * Browsers have a limit on the amount of webgl contexts that can be created at once,
 * so when rendering a list of trophies it's better to wrap them in a context provider
 * which will share one context across all trophies.
 *
 * If ommitted, each trophy will create its own context internally.
 */

export function TrophyContextProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [context, setContext] = useState<PicoCAD2Context | undefined>();

	useEffect(() => {
		const ctx = new PicoCAD2Context();
		setContext(ctx);
		return () => {
			ctx.dispose();
		};
	}, []);

	/**
	 * Children always render so the surrounding layout (placeholders, pagination, etc.)
	 * doesn't shift when the shared context becomes available. While `context` is undefined
	 * we publish an `isLoading` value so descendant `Trophy` components render an empty
	 * spacer instead of falling back to their own internal WebGL context — which would
	 * defeat the point of sharing and quickly hit the browser's per-page context limit.
	 */
	const value: TrophyCtxValue = context
		? { context }
		: { context: undefined, isLoading: true };

	return <TrophyCtx.Provider value={value}>{children}</TrophyCtx.Provider>;
}

export function Trophy({
	model,
	className,
	preview,
	tier,
	tentativeTier,
	disableCameraControls,
}: {
	model: string;
	className?: string;
	preview?: boolean;
	tier?: number | null;
	tentativeTier?: number | null;
	disableCameraControls?: boolean;
}) {
	const ctxValue = useContext(TrophyCtx);
	const context = ctxValue?.context;
	const isLoadingSharedContext =
		ctxValue !== undefined && ctxValue.context === undefined;
	const viewerRef = useRef<PicoCAD2Viewer | null>(null);
	const [error, setError] = useState<boolean>(false);

	const modelState = decompressTrophyModel(model);

	const canvasRef = (canvas: HTMLCanvasElement | null) => {
		if (!canvas) {
			viewerRef.current?.dispose();
			viewerRef.current = null;
			return;
		}

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

		if (preview) {
			viewer.draw();
			viewer.dispose();
			return;
		}

		viewer.cameraMode = "spin";
		viewer.cameraModeSpeed = 5;
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
	};

	const effectiveTier = tier ?? tentativeTier ?? null;
	const containerStyle = effectiveTier
		? ({
				"--tier-bg": `var(--tier-bg-${effectiveTier})`,
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

	if (error) {
		return (
			<div className={clsx(style.container, className)} style={containerStyle}>
				<div className={clsx(style.trophy, style.error)}>
					<Ban size={48} />
				</div>
				{tierPill}
			</div>
		);
	}

	if (isLoadingSharedContext) {
		return (
			<div className={clsx(style.container, className)}>
				<div className={style.trophy} />
			</div>
		);
	}

	return (
		<div className={clsx(style.container, className)} style={containerStyle}>
			<canvas
				ref={canvasRef}
				className={clsx(style.trophy, {
					[style.interactive]: !preview && !disableCameraControls,
				})}
			/>
			{tierPill}
		</div>
	);
}
