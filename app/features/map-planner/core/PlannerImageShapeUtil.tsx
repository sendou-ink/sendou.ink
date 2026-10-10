import {
	ImageShapeUtil,
	type SvgExportContext,
	type TLImageShape,
} from "@tldraw/tldraw";
import { OUTLINED_IMAGE_SRC_SUFFIX } from "../plans-constants";

const OUTLINE_FILTER_ID = "planner-image-outline";
const OUTLINE_COLOR = "crimson";
// matches the CSS drop-shadow blur radius of the on-canvas outline, SVG takes half of it as standard deviation
const OUTLINE_STD_DEVIATION = 0.8;

/** The default image shape, except outlined images keep their outline when the plan is exported as an image. */
export class PlannerImageShapeUtil extends ImageShapeUtil {
	override async toSvg(shape: TLImageShape, ctx: SvgExportContext) {
		const svg = await super.toSvg(shape, ctx);
		if (!svg || !this.isOutlined(shape)) return svg;

		ctx.addExportDef({
			key: OUTLINE_FILTER_ID,
			getElement: () => (
				<filter id={OUTLINE_FILTER_ID}>
					{[1, 2, 3].map((i) => (
						<feDropShadow
							key={i}
							dx={0}
							dy={0}
							stdDeviation={OUTLINE_STD_DEVIATION}
							floodColor={OUTLINE_COLOR}
						/>
					))}
				</filter>
			),
		});

		return <g filter={`url(#${OUTLINE_FILTER_ID})`}>{svg}</g>;
	}

	private isOutlined(shape: TLImageShape) {
		if (!shape.props.assetId) return false;

		const asset = this.editor.getAsset(shape.props.assetId);

		return (
			asset?.type === "image" &&
			Boolean(asset.props.src?.endsWith(OUTLINED_IMAGE_SRC_SUFFIX))
		);
	}
}
