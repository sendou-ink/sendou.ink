import clsx from "clsx";
import {
	Clapperboard,
	ClipboardList,
	Clock,
	Coffee,
	Flag,
	Gamepad2,
	type LucideIcon,
	Map as MapIcon,
	Mic,
	Shield,
	TriangleAlert,
	Trophy,
	Users,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLatestRef } from "~/hooks/useLatestRef";
import { BROADCAST_SCENE_GROUPS } from "../broadcast-cast-constants";
import type { CastScene } from "../broadcast-cast-types";
import styles from "./ScenePicker.module.css";

export const SCENE_ICONS: Record<CastScene, LucideIcon> = {
	starting: Clock,
	casters: Mic,
	rosters: Users,
	maps: MapIcon,
	game: Gamepad2,
	results: ClipboardList,
	break: Coffee,
	replays: Clapperboard,
	bracket: Trophy,
	team: Shield,
	technical: TriangleAlert,
	ending: Flag,
};

/** Number keys 1–9 and 0 pick these, in this order. */
const SCENES_BY_HOTKEY: CastScene[] = BROADCAST_SCENE_GROUPS.flatMap(
	(group) => group.scenes,
).slice(0, 10);

/**
 * Every scene as a tile with its icon and hotkey, in its group. `renderTile` makes the button picking the scene
 * out of the tile's props, e.g. one submitting it. Scenes `isDisabled` gives can't be picked.
 */
export function ScenePicker({
	selected,
	liveScene,
	isDisabled,
	renderTile,
}: {
	selected: CastScene;
	liveScene?: CastScene;
	isDisabled?: (scene: CastScene) => boolean;
	renderTile: (
		scene: CastScene,
		tile: { className: string; isDisabled: boolean; children: React.ReactNode },
	) => React.ReactNode;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className={styles.groups}>
			{BROADCAST_SCENE_GROUPS.map((group) => (
				<fieldset key={group.key} className={styles.group}>
					<legend className={styles.groupLabel}>
						{t(`broadcast:dashboard.sceneGroup.${group.key}`)}
					</legend>
					{group.scenes.map((scene) => {
						const Icon = SCENE_ICONS[scene];
						const hotkeyIdx = SCENES_BY_HOTKEY.indexOf(scene);

						return (
							<React.Fragment key={scene}>
								{renderTile(scene, {
									className: clsx(styles.tile, {
										[styles.tileSelected]: selected === scene,
									}),
									isDisabled: isDisabled?.(scene) ?? false,
									children: (
										<>
											{liveScene === scene ? (
												<span className={styles.liveBadge}>
													{t("broadcast:dashboard.live")}
												</span>
											) : null}
											{hotkeyIdx === -1 ? null : (
												<kbd className={styles.keycap} aria-hidden>
													{(hotkeyIdx + 1) % 10}
												</kbd>
											)}
											<Icon className={styles.icon} />
											{t(`broadcast:scene.${scene}`)}
										</>
									),
								})}
							</React.Fragment>
						);
					})}
				</fieldset>
			))}
		</div>
	);
}

/** The number keys pick the scene their {@link ScenePicker} tile shows, unless `isDisabled` gives it. */
export function useSceneHotkeys({
	selected,
	isDisabled,
	onSelect,
}: {
	selected: CastScene;
	isDisabled?: (scene: CastScene) => boolean;
	onSelect: (scene: CastScene) => void;
}) {
	const latest = useLatestRef({ selected, isDisabled, onSelect });

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!isShortcut(event) || !/^\d$/.test(event.key)) return;
			const current = latest.current;

			// 1 is the first scene, 0 the tenth
			const scene = SCENES_BY_HOTKEY[(Number(event.key) + 9) % 10];
			if (!scene || scene === current.selected || current.isDisabled?.(scene)) {
				return;
			}

			current.onSelect(scene);
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [latest]);
}

/** A key press without modifiers that isn't typing into a field or meant for an open popover or dialog. */
function isShortcut(event: KeyboardEvent) {
	if (
		event.repeat ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey
	) {
		return false;
	}

	const target = event.target;
	if (!(target instanceof HTMLElement)) return true;

	const isTyping =
		target.isContentEditable ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLInputElement &&
			!["radio", "checkbox", "button", "submit"].includes(target.type));

	return !isTyping && !target.closest("[popover], dialog");
}
