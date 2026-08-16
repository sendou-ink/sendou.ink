import type { Tournament } from "./Tournament";

class RunningTournamentsRegistry {
	tournaments = new Map<number, Tournament>();

	add(tournament: Tournament) {
		this.tournaments.set(tournament.ctx.id, tournament);
	}

	remove(tournamentId: number) {
		this.tournaments.delete(tournamentId);
	}

	get(tournamentId: number) {
		return this.tournaments.get(tournamentId);
	}

	get all() {
		return Array.from(this.tournaments.values());
	}

	has(tournamentId: number) {
		return this.tournaments.has(tournamentId);
	}

	clear() {
		this.tournaments.clear();
	}
}

export const RunningTournaments = new RunningTournamentsRegistry();
