import { SvelteMap } from 'svelte/reactivity';
import * as MapPool from '$lib/core/maps/MapPool';
import type * as TournamentBracketAPI from '$lib/api/tournament-bracket';
import * as PickBan from '$lib/core/tournament-match/PickBan';
import * as MapList from '$lib/core/maps/MapList';
import type { ModeWithStage } from '$lib/constants/in-game/types';

export class BracketMapList {
	mapPool;
	// xxx: type for maps should also include NULL for unset maps
	rounds;
	pickBan: PickBan.Type = PickBan.types[0];

	patterns = new SvelteMap<number, string>();

	constructor(
		mapPool: MapPool.PartialMapPool,
		rounds: TournamentBracketAPI.queries.MapListPickerRoundData[]
	) {
		this.mapPool = mapPool;
		this.rounds = $state(rounds);
	}

	updatePattern(count: number, pattern: string) {
		this.patterns.set(count, pattern);
	}

	updatePickBanForAll(type: PickBan.Type) {
		this.pickBan = type;

		for (const round of this.rounds) {
			round.maps.pickBan = round.maps.pickBan ? type : null;
		}
	}

	updateMaps(roundId: number, maps: TournamentBracketAPI.queries.MapListPickerRoundData['maps']) {
		const round = this.rounds.find((r) => r.id === roundId);
		if (round) {
			round.maps = maps;
		}
	}

	updateCountForAll(count: number) {
		for (const round of this.rounds) {
			round.maps.count = count;
		}
	}

	generateMaps() {
		const generator = MapList.generate({ mapPool: this.mapPool });
		generator.next();

		for (const round of this.rounds) {
			// xxx: handle pickban specialty
			const list = generator.next({ amount: round.maps.count }).value;

			round.maps.list = list;
		}
	}

	clear() {
		for (const round of this.rounds) {
			round.maps.list = [];
		}
	}

	mapAppearances({ mode, stageId }: ModeWithStage) {
		return this.rounds.filter((round) =>
			round.maps.list?.some((m) => m.mode === mode && m.stageId === stageId)
		);
	}
}
