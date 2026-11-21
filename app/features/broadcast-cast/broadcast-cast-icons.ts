import {
	Clapperboard,
	ClipboardList,
	Clock,
	Coffee,
	Flag,
	Gamepad2,
	Hand,
	Link2,
	type LucideIcon,
	Map as MapIcon,
	Mic,
	ScanEye,
	Shield,
	TriangleAlert,
	Trophy,
	Users,
} from "lucide-react";
import type { BroadcastAdvance } from "~/features/broadcast/broadcast-types";
import type { CastScene } from "./broadcast-cast-types";

/** Each scene's icon on the dashboard's scene tiles and queue tabs. */
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

/** How a queue item goes on air: on a Take, when the scene before ends, or as the scanner sees a game start or end. */
export const ADVANCE_ICONS: Record<BroadcastAdvance, LucideIcon> = {
	take: Hand,
	timer: Link2,
	game: ScanEye,
};
