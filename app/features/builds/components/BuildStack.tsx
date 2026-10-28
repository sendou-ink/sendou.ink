import clsx from "clsx";
import { FoldHorizontal, UnfoldHorizontal } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import styles from "./BuildStack.module.css";

const LAYER_OFFSET_PX = 4;
const MAX_PEEKING_LAYERS = 2;
const FAN_OUT_OFFSET_PX = 14;
const MAX_FANNED_LAYERS = 4;
const FAN_OUT_DURATION_MS = 150;

interface BuildStackProps {
	buildId: number;
	/** The author's other builds, stacked behind the card until expanded. */
	stack?: {
		buildIds: number[];
		isExpanded: boolean;
		onToggle: () => void;
	};
	/** Renders the card, `toggle` is the stack's expand/collapse button for the card to place. */
	children: (toggle: React.ReactNode) => React.ReactNode;
}

/**
 * Grid item of a build card, its `data-flip-id`s let a surrounding `Flipper` animate the stacked builds
 * out of the stack into their own cells and back.
 */
export function BuildStack({ buildId, stack, children }: BuildStackProps) {
	const { t } = useTranslation(["builds", "common"]);
	const ref = React.useRef<HTMLDivElement>(null);
	const [isFanningOut, setIsFanningOut] = React.useState(false);

	const stackedBuildIds = stack && !stack.isExpanded ? stack.buildIds : [];

	const expand = async () => {
		if (!stack || isFanningOut) return;

		setIsFanningOut(true);
		await fanOutLayers(ref.current);
		setIsFanningOut(false);
		stack.onToggle();
	};

	const toggleLabel = stack?.isExpanded
		? t("common:actions.showLess")
		: t("builds:stack.moreBuilds", { count: stack?.buildIds.length ?? 0 });

	const toggle = stack ? (
		<button
			type="button"
			className={clsx(styles.toggle, {
				[styles.toggleWithCount]: !stack.isExpanded,
			})}
			onClick={stack.isExpanded ? stack.onToggle : expand}
			aria-expanded={stack.isExpanded}
			aria-label={toggleLabel}
			title={toggleLabel}
			data-testid={
				stack.isExpanded ? "collapse-build-stack" : "expand-build-stack"
			}
		>
			{stack.isExpanded ? (
				<FoldHorizontal />
			) : (
				<>
					<UnfoldHorizontal />+{stack.buildIds.length}
				</>
			)}
		</button>
	) : null;

	return (
		<div
			ref={ref}
			className={clsx(styles.stack, { [styles.stackWithToggle]: stack })}
		>
			{stackedBuildIds.map((id, i) => (
				<div
					key={id}
					className={styles.layer}
					data-flip-id={id}
					style={
						{
							"--layer-offset": `${layerOffset(i)}px`,
							zIndex: -1 - i,
						} as React.CSSProperties
					}
				/>
			))}
			<div className={styles.card} data-flip-id={buildId}>
				{children(toggle)}
			</div>
		</div>
	);
}

function layerOffset(index: number) {
	return Math.min(index + 1, MAX_PEEKING_LAYERS) * LAYER_OFFSET_PX;
}

/** Spreads the stacked layers out to the right, the Flipper then animates the cards on from where the layers ended up. */
async function fanOutLayers(root: HTMLElement | null) {
	if (!root || IS_E2E_TEST_RUN) return;
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

	const layers = root.querySelectorAll<HTMLElement>(`.${styles.layer}`);
	const animations = Array.from(layers, (layer, i) => {
		const fannedOffset =
			(Math.min(i, MAX_FANNED_LAYERS - 1) + 1) * FAN_OUT_OFFSET_PX;

		return layer.animate(
			{ translate: `${fannedOffset - layerOffset(i)}px 0` },
			{ duration: FAN_OUT_DURATION_MS, easing: "ease-out", fill: "forwards" },
		);
	});

	await Promise.all(animations.map((animation) => animation.finished)).catch(
		() => {},
	);
}
