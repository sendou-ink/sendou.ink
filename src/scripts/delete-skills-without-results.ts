import 'dotenv/config';
import { db } from '~/db/sql';
import { logger } from '~/utils/logger';

async function main() {
	const skills = await db
		.selectFrom('Skill')
		.leftJoin('TournamentResult', (join) =>
			join
				.onRef('TournamentResult.tournamentId', '=', 'Skill.tournamentId')
				.onRef('TournamentResult.userId', '=', 'Skill.userId')
		)
		.select(['Skill.id'])
		.where('Skill.tournamentId', 'is not', null)
		.where('TournamentResult.tournamentId', 'is', null)
		.execute();

	logger.info(`Found ${skills.length} skills without results`);

	await db
		.updateTable('Skill')
		.set({
			tournamentId: null
		})
		.where(
			'id',
			'in',
			skills.map((skill) => skill.id)
		)
		.execute();

	logger.info('Deleted skills without results');
}

void main();
