import clsx from "clsx";
import * as React from "react";
import { usePrefersReducedMotion } from "~/hooks/usePrefersReducedMotion";
import { chatStickerUrl } from "~/utils/urls";
import { useIsAttending } from "../chat-hooks";
import type * as Stickers from "../core/Stickers";
import styles from "./StickerImage.module.css";

export function StickerImage({
	sticker,
	size,
	alt = "",
	className,
	"data-testid": testId,
}: {
	sticker: Stickers.ChatSticker;
	size: number;
	alt?: string;
	className?: string;
	"data-testid"?: string;
}) {
	const attending = useIsAttending();
	const prefersReducedMotion = usePrefersReducedMotion();
	const canvasRef = React.useRef<HTMLCanvasElement>(null);

	const paused = !attending || prefersReducedMotion;

	const drawFirstFrame = (image: HTMLImageElement) => {
		const canvas = canvasRef.current;
		if (!canvas || !image.naturalWidth) return;

		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		canvas.getContext("2d")?.drawImage(image, 0, 0);
	};

	return (
		<span
			className={clsx(styles.sticker, className)}
			style={{ width: size, height: size }}
			data-paused={paused ? "true" : undefined}
			data-testid={testId}
		>
			<img
				ref={(image) => {
					if (image?.complete) drawFirstFrame(image);
				}}
				src={chatStickerUrl(sticker.id)}
				alt={alt}
				title={alt || undefined}
				width={size}
				height={size}
				className={styles.animated}
				onLoad={(event) => drawFirstFrame(event.currentTarget)}
			/>
			<canvas ref={canvasRef} className={styles.still} aria-hidden />
		</span>
	);
}
