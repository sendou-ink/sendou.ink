import clsx from "clsx";
import { LogOut, Maximize } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import type { PlanDocument } from "../core/PlanDocument";
import type { PlanEditor } from "../core/PlanEditor";
import styles from "./ActionBar.module.css";
import { StagePicker } from "./StagePicker";

/** Map choice and view controls on the right of the map. */
export function ActionBar({
	editor,
	document,
	onFitView,
	className,
}: {
	editor: PlanEditor;
	document: PlanDocument;
	onFitView: () => void;
	className?: string;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={clsx(styles.actionBar, className)}>
			<StagePicker editor={editor} document={document} />
			<SendouButton
				variant="minimal"
				shape="square"
				icon={<Maximize />}
				aria-label={t("common:plans.fitView")}
				title={t("common:plans.fitView")}
				onClick={onFitView}
				testId="plan-fit-view-button"
			/>
			<LinkButton
				to="/"
				variant="minimal"
				shape="square"
				icon={<LogOut />}
				aria-label={t("common:plans.leave")}
			/>
		</div>
	);
}
