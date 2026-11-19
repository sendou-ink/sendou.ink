import clsx from "clsx";
import { Redo2, Undo2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import type { PlanEditor } from "../core/PlanEditor";
import styles from "./ToolSidebar.module.css";

/** The drawing tools on the left of the map. */
export function ToolSidebar({
	editor,
	className,
}: {
	editor: PlanEditor;
	className?: string;
}) {
	const { t } = useTranslation(["common"]);
	const canUndo = React.useSyncExternalStore(editor.subscribe, editor.canUndo);
	const canRedo = React.useSyncExternalStore(editor.subscribe, editor.canRedo);

	return (
		<div className={clsx(styles.sidebar, className)}>
			<SendouButton
				variant="minimal"
				shape="square"
				icon={<Undo2 />}
				aria-label={t("common:plans.undo")}
				title={t("common:plans.undo")}
				isDisabled={!canUndo}
				onClick={editor.undo}
				testId="plan-undo-button"
			/>
			<SendouButton
				variant="minimal"
				shape="square"
				icon={<Redo2 />}
				aria-label={t("common:plans.redo")}
				title={t("common:plans.redo")}
				isDisabled={!canRedo}
				onClick={editor.redo}
				testId="plan-redo-button"
			/>
		</div>
	);
}
