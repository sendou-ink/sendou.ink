import clsx from "clsx";
import type * as React from "react";
import type { StageId } from "~/modules/in-game-lists/types";
import { stageBannerImageUrl } from "~/utils/urls";
import styles from "./StageBannerBox.module.css";

/**
 * Box with a stage banner image fading in from the right. The fade color
 * defaults to `--color-bg-high`; override per use with the
 * `--stage-banner-fade` CSS variable.
 */
export function StageBannerBox({
	stageId,
	className,
	children,
}: {
	stageId: StageId;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={clsx(styles.banner, className)}
			style={
				{
					"--stage-banner": `url(${stageBannerImageUrl(stageId)})`,
				} as React.CSSProperties
			}
		>
			{children}
		</div>
	);
}
