import type { Tournament } from "./Tournament";

class RunningTournamentsRegistry {
	tournaments = new Map<number, Tournament>();
	usersPlaying = new Set<number>();
	userToTournament = new Map<number, number>();

	add(tournament: Tournament) {
		const tournamentId = tournament.ctx.id;
		const existing = this.tournaments.get(tournamentId);

		if (existing === tournament) {
			return;
		}

		if (existing) {
			this.updateTournamentUsers(tournamentId, tournament);
			return;
		}

		this.tournaments.set(tournamentId, tournament);
		this.#addUsersFromTournament(tournament);
	}

	remove(tournamentId: number) {
		const tournament = this.tournaments.get(tournamentId);
		if (!tournament) return;

		this.#removeUsersFromTournament(tournament);
		this.tournaments.delete(tournamentId);
	}

	get(tournamentId: number) {
		return this.tournaments.get(tournamentId);
	}

	has(tournamentId: number) {
		return this.tournaments.has(tournamentId);
	}

	isUserPlaying(userId: number) {
		return this.usersPlaying.has(userId);
	}

	getUserTournamentId(userId: number) {
		return this.userToTournament.get(userId);
	}

	getUserTournament(userId: number) {
		const tournamentId = this.userToTournament.get(userId);
		if (tournamentId === undefined) return undefined;

		return this.tournaments.get(tournamentId);
	}

	updateTournamentUsers(tournamentId: number, tournament: Tournament) {
		const existingTournament = this.tournaments.get(tournamentId);
		if (existingTournament) {
			this.#removeUsersFromTournament(existingTournament);
		}

		this.tournaments.set(tournamentId, tournament);
		this.#addUsersFromTournament(tournament);
	}

	clear() {
		this.tournaments.clear();
		this.usersPlaying.clear();
		this.userToTournament.clear();
	}

	#addUsersFromTournament(tournament: Tournament) {
		const tournamentId = tournament.ctx.id;

		for (const team of tournament.ctx.teams) {
			for (const member of team.members) {
				this.usersPlaying.add(member.userId);
				this.userToTournament.set(member.userId, tournamentId);
			}
		}
	}

	#removeUsersFromTournament(tournament: Tournament) {
		for (const team of tournament.ctx.teams) {
			for (const member of team.members) {
				this.usersPlaying.delete(member.userId);
				this.userToTournament.delete(member.userId);
			}
		}
	}
}

export const RunningTournaments = new RunningTournamentsRegistry();
