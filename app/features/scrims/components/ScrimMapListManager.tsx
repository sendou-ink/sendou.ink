import { Map, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { SecondaryAction } from "~/components/match-page/SecondaryAction";
import type { loader } from "../loaders/scrims.$id.server";
import type { ScrimSide } from "../scrims-types";
import { ScrimMapListForm } from "./ScrimMapListForm";
import styles from "./ScrimMapListManager.module.css";

interface Props {
	viewerSide: ScrimSide;
	standalone?: boolean;
}

export function ScrimMapListManager({ viewerSide, standalone }: Props) {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();
	const ownList = data.mapByMap.mapLists.find((l) => l.side === viewerSide);
	const [isOpen, setIsOpen] = useState(() => !ownList);

	return (
		<SecondaryAction
			isOpen={isOpen}
			onOpenChange={setIsOpen}
			collapsedLabel={t("scrims:mapByMap.manageMapLists")}
			collapsedIcon={<Map size={16} />}
			standalone={standalone}
		>
			<div className={styles.root}>
				{ownList ? null : (
					<>
						<p className={styles.intro}>
							{t("scrims:mapByMap.submitList.intro")}
						</p>
						<ScrimMapListForm viewerSide={viewerSide} />
					</>
				)}
				<MapListsSummary viewerSide={viewerSide} />
			</div>
		</SecondaryAction>
	);
}

function MapListsSummary({ viewerSide }: { viewerSide: ScrimSide }) {
	const { t } = useTranslation(["scrims", "q"]);
	const data = useLoaderData<typeof loader>();
	const lists = data.mapByMap.mapLists;

	const sides: ScrimSide[] = ["ALPHA", "BRAVO"];

	return (
		<div className={styles.mapListsSummary}>
			{sides.map((side) => {
				const list = lists.find((l) => l.side === side);
				const isOwn = side === viewerSide;
				return (
					<div
						key={side}
						className={styles.mapListRow}
						data-testid={`map-list-row-${side}`}
					>
						<div className={styles.mapListRowHeader}>
							{side === "ALPHA"
								? t("q:match.sides.alpha")
								: t("q:match.sides.bravo")}
						</div>
						<div className={styles.mapListBody}>
							{list ? (
								<>
									<MapListDisplay
										tournament={list.tournament}
										mapCount={list.mapList.length}
									/>
									{isOwn ? <RemoveOwnListButton /> : null}
								</>
							) : (
								<span className={styles.mapListRowMissing}>
									{t("scrims:mapByMap.noListYet")}
								</span>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function RemoveOwnListButton() {
	const { t } = useTranslation(["scrims", "common"]);
	return (
		<FormWithConfirm
			fields={[["_action", "REMOVE_MAP_LIST"]]}
			dialogHeading={t("scrims:mapByMap.removeListConfirm")}
			submitButtonText={t("common:actions.remove")}
			submitButtonTestId="remove-list-button"
		>
			<SendouButton
				variant="minimal-destructive"
				size="miniscule"
				icon={<Trash2 size={16} />}
				aria-label={t("scrims:mapByMap.removeList")}
			/>
		</FormWithConfirm>
	);
}

function MapListDisplay({
	tournament,
	mapCount,
}: {
	tournament: { id: number; name: string } | undefined;
	mapCount: number;
}) {
	const { t } = useTranslation(["scrims"]);
	if (tournament) {
		return <span>{tournament.name}</span>;
	}
	return <span>{t("scrims:mapByMap.poolList", { count: mapCount })}</span>;
}
