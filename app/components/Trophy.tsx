import { ungzip } from "pako";
import { PicoCAD2Context, PicoCAD2Viewer } from "picocad2-web";
import { createContext, useContext, useEffect, useRef } from "react";

const TrophyCtx = createContext<PicoCAD2Context | undefined>(undefined);

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
	const ref = useRef<PicoCAD2Context | null>(null);

	if (!ref.current && typeof document !== "undefined") {
		ref.current = new PicoCAD2Context();
	}

	useEffect(() => {
		return () => {
			ref.current?.dispose();
		};
	}, []);

	return (
		<TrophyCtx.Provider value={ref.current ?? undefined}>
			{children}
		</TrophyCtx.Provider>
	);
}

export function Trophy({
	model,
	preview,
}: {
	model: string;
	preview?: boolean;
}) {
	const context = useContext(TrophyCtx);
	const viewerRef = useRef<PicoCAD2Viewer | null>(null);

	const modelState = ungzip(
		Uint8Array.from(atob(model), (c) => c.charCodeAt(0)),
		{
			to: "string",
		},
	);

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

		viewer.setState(JSON.parse(modelState));

		if (preview) {
			viewer.draw();
			viewer.dispose();
			return;
		}

		viewer.cameraMode = "spin";
		viewer.cameraModeSpeed = 5;
		viewer.startRenderLoop(false);
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

	return <canvas ref={canvasRef} />;
}
