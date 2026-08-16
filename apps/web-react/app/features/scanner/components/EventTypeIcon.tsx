/**
 * Shared lucide glyph per detected-event type, so the events summary line
 * and the event cards mark each type with the same icon.
 */

import {
	CircleHelp,
	History,
	type LucideIcon,
	Map as MapIcon,
	Play,
	RotateCcw,
	Skull,
	Target,
	Trophy,
	User,
} from "lucide-react";
import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import { MAP_START_EVENT_TYPE } from "../core/detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "../core/detectors/minimap/index";
import { OBJECTIVE_EVENT_TYPE } from "../core/detectors/objective/index";
import { SCOREBOARD_EVENT_TYPE } from "../core/detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../core/detectors/scoreboard-battle-log/index";
import { SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE } from "../core/detectors/scoreboard-battle-log-replay/index";
import { SCOREBOARD_OWN_EVENT_TYPE } from "../core/detectors/scoreboard-own/index";

const EVENT_TYPE_ICONS: Record<string, LucideIcon> = {
	[MAP_START_EVENT_TYPE]: Play,
	[DEATH_EVENT_TYPE]: Skull,
	[MINIMAP_EVENT_TYPE]: MapIcon,
	[OBJECTIVE_EVENT_TYPE]: Target,
	[SCOREBOARD_EVENT_TYPE]: Trophy,
	[SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE]: RotateCcw,
	[SCOREBOARD_BATTLE_LOG_EVENT_TYPE]: History,
	[SCOREBOARD_OWN_EVENT_TYPE]: User,
};

export function EventTypeIcon({
	type,
	size = 12,
}: {
	type: string;
	size?: number;
}) {
	const Icon = EVENT_TYPE_ICONS[type] ?? CircleHelp;
	return <Icon size={size} aria-hidden />;
}
