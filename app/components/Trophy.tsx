import { ungzip } from "pako";
import { PicoCAD2Viewer } from "picocad2-web";
import { useRef } from "react";

export function Trophy({
	model,
	preview,
}: {
	model: string;
	preview?: boolean;
}) {
	const modelState = ungzip(
		Uint8Array.from(atob(model), (c) => c.charCodeAt(0)),
		{
			to: "string",
		},
	);

	const viewerRef = useRef<PicoCAD2Viewer | null>(null);

	const canvasRef = (canvas: HTMLCanvasElement | null) => {
		if (!canvas) {
			viewerRef.current?.dispose();
			viewerRef.current = null;
			return;
		}

		const viewer = new PicoCAD2Viewer({
			canvas,
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
