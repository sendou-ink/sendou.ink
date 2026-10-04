import clsx from "clsx";
import { Image, RotateCw } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { attachCropGestures } from "./crop-gestures";
import * as ImageCrop from "./ImageCrop";
import styles from "./ImageCropDialog.module.css";

const ZOOM_SLIDER_STEP = 0.01;
const MIN_VIEWPORT_ASPECT_RATIO = 5 / 4;
const VIEWPORT_TO_FRAME_ASPECT_RATIO = 0.8;

interface ImageCropDialogProps {
	imageUrl: string;
	imageSize: ImageCrop.Size;
	aspectRatio: number;
	shape: "circle" | "rounded";
	onApply: (crop: ImageCrop.Crop) => Promise<void>;
	onClose: () => void;
}

/** Discord style editor for a picked image: drag, zoom and rotate it under a frame shaped like the final image. */
export function ImageCropDialog({
	imageUrl,
	imageSize,
	aspectRatio,
	shape,
	onApply,
	onClose,
}: ImageCropDialogProps) {
	const { t } = useTranslation(["common", "forms"]);
	const [crop, setCrop] = React.useState(ImageCrop.initial);
	const [isApplying, setIsApplying] = React.useState(false);
	const viewportRef = React.useRef<HTMLDivElement>(null);
	const frameRef = React.useRef<HTMLDivElement>(null);

	const bounds: ImageCrop.CropBounds = { imageSize, aspectRatio };

	React.useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;

		const cropBounds = {
			imageSize: { width: imageSize.width, height: imageSize.height },
			aspectRatio,
		};

		return attachCropGestures(viewport, {
			onPan: (delta) => {
				const frame = frameRect(frameRef.current);
				if (!frame) return;

				setCrop((current) =>
					ImageCrop.pan(current, delta, frame.width, cropBounds),
				);
			},
			onZoom: (factor, anchor) => {
				const frame = frameRect(frameRef.current);
				if (!frame) return;

				const anchorFromFrameCenter = anchor
					? {
							x: anchor.x - (frame.left + frame.width / 2),
							y: anchor.y - (frame.top + frame.height / 2),
						}
					: { x: 0, y: 0 };

				setCrop((current) =>
					ImageCrop.zoomAround(
						current,
						current.zoom * factor,
						anchorFromFrameCenter,
						frame.width,
						cropBounds,
					),
				);
			},
		});
	}, [imageSize.width, imageSize.height, aspectRatio]);

	const handleZoomSliderChange = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const frame = frameRect(frameRef.current);
		if (!frame) return;

		const zoom = Number(event.target.value);
		setCrop((current) =>
			ImageCrop.zoomAround(current, zoom, { x: 0, y: 0 }, frame.width, bounds),
		);
	};

	const handleApply = async () => {
		setIsApplying(true);
		try {
			await onApply(crop);
		} finally {
			setIsApplying(false);
		}
	};

	const orientedImage = ImageCrop.orientedSize(imageSize, crop.rotation);
	const visible = ImageCrop.sourceRect(crop, bounds);

	return (
		<SendouDialog
			heading={t("forms:imageCrop.heading")}
			onClose={onClose}
			className={styles.dialog}
		>
			<div
				ref={viewportRef}
				className={styles.viewport}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys and +/- move and zoom the image
				tabIndex={0}
				role="application"
				aria-label="Image crop area. Drag or use the arrow keys to move the image, + and - to zoom."
				style={{
					aspectRatio: Math.max(
						MIN_VIEWPORT_ASPECT_RATIO,
						aspectRatio * VIEWPORT_TO_FRAME_ASPECT_RATIO,
					),
				}}
			>
				<div
					ref={frameRef}
					className={styles.frame}
					style={{ "--aspect-ratio": aspectRatio } as React.CSSProperties}
				>
					<div
						className={styles.orientedImage}
						style={{
							left: `${(-visible.x / visible.width) * 100}%`,
							top: `${(-visible.y / visible.height) * 100}%`,
							width: `${(orientedImage.width / visible.width) * 100}%`,
							height: `${(orientedImage.height / visible.height) * 100}%`,
						}}
					>
						<img
							src={imageUrl}
							alt=""
							draggable={false}
							className={clsx(styles.image, {
								[styles.sideways]: crop.rotation % 180 !== 0,
							})}
							style={
								{ "--rotation": `${crop.rotation}deg` } as React.CSSProperties
							}
						/>
					</div>
					<div
						className={clsx(styles.frameOutline, {
							[styles.circle]: shape === "circle",
						})}
					/>
				</div>
			</div>
			<div className={styles.controls}>
				<Image className={styles.zoomOutIcon} aria-hidden />
				<input
					type="range"
					min={1}
					max={ImageCrop.MAX_ZOOM}
					step={ZOOM_SLIDER_STEP}
					value={crop.zoom}
					onChange={handleZoomSliderChange}
					aria-label="Zoom"
				/>
				<Image className={styles.zoomInIcon} aria-hidden />
				<SendouButton
					icon={<RotateCw />}
					variant="minimal"
					shape="circle"
					className={styles.rotateButton}
					aria-label="Rotate"
					onClick={() =>
						setCrop((current) => ImageCrop.rotate(current, bounds))
					}
				/>
			</div>
			<div className={styles.footer}>
				<SendouButton
					variant="minimal"
					onClick={() => setCrop(ImageCrop.initial())}
				>
					{t("common:actions.reset")}
				</SendouButton>
				<div className="stack horizontal sm">
					<SendouButton variant="outlined" onClick={onClose}>
						{t("common:actions.cancel")}
					</SendouButton>
					<SendouButton onClick={handleApply} isPending={isApplying}>
						{t("common:actions.apply")}
					</SendouButton>
				</div>
			</div>
		</SendouDialog>
	);
}

function frameRect(frame: HTMLDivElement | null) {
	return frame?.getBoundingClientRect() ?? null;
}
