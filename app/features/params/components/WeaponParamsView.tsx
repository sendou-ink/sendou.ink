import { useTranslation } from "react-i18next";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Main } from "~/components/Main";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import type {
	ParsedWeaponParams,
	SpecialPointWithHistory,
	WeaponKitInfo,
	WeaponParamKind,
	WeaponPatch,
} from "../weapon-params-types";
import { WeaponKits } from "./WeaponKits";
import { WeaponParamsTable } from "./WeaponParamsTable";
import styles from "./WeaponParamsView.module.css";
import { WeaponPatchHistory } from "./WeaponPatchHistory";

export function WeaponParamsView({
	kind,
	weaponId,
	categoryWeaponIds,
	weaponParams,
	specialPoints,
	versions,
	patchHistory,
	kits,
}: {
	kind: WeaponParamKind;
	weaponId: number;
	categoryWeaponIds: number[];
	weaponParams: Record<string, ParsedWeaponParams>;
	specialPoints?: Record<string, SpecialPointWithHistory[]>;
	versions: string[];
	patchHistory: WeaponPatch[];
	kits?: WeaponKitInfo[];
}) {
	const { t } = useTranslation(["params"]);

	const [tab, setTab] = useSearchParamState({
		name: "tab",
		defaultValue: "params",
		revive: (value) => (value === "patches" ? "patches" : "params"),
	});

	return (
		<Main className={styles.container} bigger>
			{kits ? <WeaponKits kits={kits} /> : null}
			<SendouTabs
				selectedKey={tab}
				onSelectionChange={(key) => setTab(String(key))}
				className={styles.tabs}
			>
				<SendouTabList>
					<SendouTab id="params">{t("params:tab.params")}</SendouTab>
					<SendouTab id="patches" number={patchHistory.length}>
						{t("params:tab.patches")}
					</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="params">
					<WeaponParamsTable
						kind={kind}
						currentWeaponId={weaponId}
						categoryWeaponIds={categoryWeaponIds}
						weaponParams={weaponParams}
						specialPoints={specialPoints}
						versions={versions}
					/>
				</SendouTabPanel>
				<SendouTabPanel id="patches">
					<WeaponPatchHistory patches={patchHistory} />
				</SendouTabPanel>
			</SendouTabs>
			<a
				href="https://leanny.github.io/"
				target="_blank"
				rel="noopener noreferrer"
				className={styles.dataCredit}
			>
				{t("params:dataCredit.lean")}
			</a>
		</Main>
	);
}
