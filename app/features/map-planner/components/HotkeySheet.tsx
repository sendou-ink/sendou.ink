import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import * as Hotkeys from "../canvas/Hotkeys";
import * as PlanHotkeys from "../core/PlanHotkeys";
import styles from "./HotkeySheet.module.css";

/** Translation keys of the commands, the tools', statuses' and slots' worked out from them. */
const COMMAND_LABEL_KEYS = {
	undo: "common:plans.undo",
	redo: "common:plans.redo",
	selectAll: "common:plans.hotkeys.selectAll",
	escape: "common:plans.hotkeys.escape",
	cheatSheet: "common:plans.hotkeys.title",
	pan: "common:plans.hotkeys.pan",
	nextColor: "common:plans.hotkeys.nextColor",
	smaller: "common:plans.hotkeys.smaller",
	bigger: "common:plans.hotkeys.bigger",
	deleteDrawings: "common:plans.deleteSelected",
	editText: "common:plans.hotkeys.editText",
	bringToFront: "common:plans.menu.bringToFront",
	sendToBack: "common:plans.menu.sendToBack",
	toggleSpecial: "common:plans.hotkeys.special",
	toggleRadius: "common:plans.menu.showRadius",
	throwSub: "common:plans.menu.throwSub",
	toggleHidden: "common:plans.hotkeys.hide",
	switchKit: "common:plans.menu.switchKit",
	switchWeapon: "common:plans.menu.switchWeapon",
	editLabel: "common:plans.hotkeys.editLabel",
	removePlayer: "common:plans.removePlayer",
	stagePicker: "common:plans.changeMap",
	fitView: "common:plans.fitView",
	fullScreen: "common:plans.fullScreen",
	copyLink: "common:plans.link.copy",
	downloadImage: "common:plans.file.downloadImage",
	downloadFile: "common:plans.file.downloadFile",
	openFile: "common:plans.file.open",
} as const satisfies Record<
	Exclude<PlanHotkeys.HotkeyCommand["type"], "tool" | "status" | "slot">,
	string
>;

const SCOPE_LABEL_KEYS = {
	player: "common:plans.hotkeys.withPlayer",
	drawings: "common:plans.hotkeys.withDrawings",
} as const;

/** The cheat sheet of every hotkey of the planner, by group, read from the hotkey table. */
export function HotkeySheet({ onClose }: { onClose: () => void }) {
	const { t } = useTranslation(["common"]);
	const [isMac] = React.useState(Hotkeys.isMac);

	const labelOf = (command: PlanHotkeys.HotkeyCommand) => {
		switch (command.type) {
			case "tool":
				return t(`common:plans.tool.${command.tool}`);
			case "status":
				return t(`common:plans.status.${command.status}`);
			case "slot":
				return t("common:plans.hotkeys.slot");
			default:
				return t(COMMAND_LABEL_KEYS[command.type]);
		}
	};

	return (
		<SendouDialog
			heading={t("common:plans.hotkeys.title")}
			onClose={onClose}
			isDismissable
			className={styles.dialog}
		>
			<div className={styles.groups} data-testid="plan-hotkey-sheet">
				{PlanHotkeys.HOTKEY_GROUPS.map((group) => (
					<section key={group} className={styles.group}>
						<h3 className={styles.groupHeading}>
							{t(`common:plans.hotkeys.group.${group}`)}
						</h3>
						<div className={styles.rows}>
							{rowsOf(group).map((row, index, rows) => (
								<React.Fragment key={row.id}>
									{row.scope !== "always" &&
									rows[index - 1]?.scope !== row.scope ? (
										<p className={styles.scope}>
											{t(SCOPE_LABEL_KEYS[row.scope])}
										</p>
									) : null}
									<div className={styles.row}>
										<span>{labelOf(row.command)}</span>
										<span className={styles.keys}>
											{row.keys.map((keys, keysIndex) => (
												<React.Fragment key={keys}>
													{keysIndex > 0 ? (
														<span className={styles.separator}>
															{row.isRange ? "–" : "/"}
														</span>
													) : null}
													<Keycaps keys={keys} isMac={isMac} />
												</React.Fragment>
											))}
										</span>
									</div>
								</React.Fragment>
							))}
						</div>
					</section>
				))}
			</div>
		</SendouDialog>
	);
}

function Keycaps({ keys, isMac }: { keys: string; isMac: boolean }) {
	return (
		<span className={styles.keycaps}>
			{PlanHotkeys.keycaps(keys, { isMac }).map((keycap) => (
				<kbd key={keycap} className={styles.keycap}>
					{keycap}
				</kbd>
			))}
		</span>
	);
}

/** The group's hotkeys, the eight slot keys as one row "1–8". */
function rowsOf(group: PlanHotkeys.HotkeyGroup) {
	const hotkeys = PlanHotkeys.HOTKEYS.filter(
		(hotkey) => hotkey.group === group,
	);
	const slotKeys = hotkeys.filter((hotkey) => hotkey.command.type === "slot");

	return hotkeys.flatMap((hotkey, index) => {
		const id = `${group}-${index}`;
		if (hotkey.command.type !== "slot") {
			return [{ ...hotkey, id, isRange: false }];
		}
		if (hotkey !== slotKeys[0]) return [];

		return [
			{
				...hotkey,
				id,
				keys: [slotKeys[0].keys[0], slotKeys.at(-1)!.keys[0]],
				isRange: true,
			},
		];
	});
}
