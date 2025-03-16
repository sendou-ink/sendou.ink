import { useEffect, useState } from "react";
import { useWindowSize } from "react-use";

type PlannerBgParams = {
	bgWidth: number;
	bgHeight: number;
	pointOffsetX: number;
	pointOffsetY: number;
};

// Dynamic background size. See this issue for more info: https://github.com/Sendouc/sendou.ink/issues/1161
const bgSizeFactor = 0.8;

export function usePlannerBg() {
	const [plannerBgParams, setPlannerBgParams] = useState<PlannerBgParams>({
		bgWidth: 1200,
		bgHeight: 800,
		pointOffsetX: 240,
		pointOffsetY: 96,
	});

	// Natively available WindowSize hook: https://usehooks-ts.com/react-hook/use-window-size
	const windowSize = useWindowSize();

	useEffect(() => {
		const bgWidth = windowSize.width * bgSizeFactor;
		const bgHeight = windowSize.height * bgSizeFactor;

		// Point offsets that move the image closer to the center of the window
		const pointOffsetX = bgWidth * (1 - bgSizeFactor);
		const pointOffsetY = 0.6 * (bgHeight * (1 - bgSizeFactor)); // Removes some dead space above the image

		setPlannerBgParams({
			bgWidth,
			bgHeight,
			pointOffsetX,
			pointOffsetY,
		});
	}, [windowSize.width, windowSize.height]);

	return plannerBgParams;
}
