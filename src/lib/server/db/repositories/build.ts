import { modesShort } from '$lib/constants/in-game/modes';
import type { BuildAbilitiesTuple, MainWeaponId, ModeShort } from '$lib/constants/in-game/types';
import { weaponIdToArrayWithAlts } from '$lib/constants/in-game/weapon-ids';
import { sortAbilities } from '$lib/core/build/ability-sorting';
import { db } from '$lib/server/db/sql';
import type { BuildWeapon, DB, Tables, TablesInsertable } from '$lib/server/db/tables';
import invariant from '$lib/utils/invariant';
import { COMMON_USER_FIELDS } from '$lib/utils/kysely.server';
import { type ExpressionBuilder, type Transaction } from 'kysely';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/sqlite';

// xxx: optimize this by denormalizing XRankPlacement.rank / XRankPlacement.power fields to BuildWeapon
export async function allByUserId(
	userId: number,
	options: {
		showPrivate: boolean;
		sortAbilities: boolean;
	}
) {
	const rows = await db
		.with('BuildWeaponWithXRankInfo', (db) =>
			db
				.selectFrom('Build')
				.innerJoin('BuildWeapon', 'Build.id', 'BuildWeapon.buildId')
				.leftJoin('SplatoonPlayer', (join) => join.on('SplatoonPlayer.userId', '=', userId))
				.leftJoin('XRankPlacement', (join) =>
					join
						.onRef('XRankPlacement.playerId', '=', 'SplatoonPlayer.id')
						.onRef('XRankPlacement.weaponSplId', '=', 'BuildWeapon.weaponSplId')
				)
				.select(({ fn }) => [
					'BuildWeapon.buildId',
					'BuildWeapon.weaponSplId',
					fn.min('XRankPlacement.rank').as('minRank'),
					fn.max('XRankPlacement.power').as('maxPower')
				])
				.where('Build.ownerId', '=', userId)
				.groupBy(['BuildWeapon.buildId', 'BuildWeapon.weaponSplId'])
		)
		.selectFrom('Build')
		.select(({ eb }) => [
			'Build.id',
			'Build.title',
			'Build.description',
			'Build.modes',
			'Build.headGearSplId',
			'Build.clothesGearSplId',
			'Build.shoesGearSplId',
			'Build.updatedAt',
			'Build.private',
			jsonArrayFrom(
				eb
					.selectFrom('BuildWeaponWithXRankInfo')
					.select([
						'BuildWeaponWithXRankInfo.weaponSplId',
						'BuildWeaponWithXRankInfo.maxPower',
						'BuildWeaponWithXRankInfo.minRank'
					])
					.orderBy('BuildWeaponWithXRankInfo.weaponSplId', 'asc')
					.whereRef('BuildWeaponWithXRankInfo.buildId', '=', 'Build.id')
			).as('weapons'),
			withAbilities(eb)
		])
		.where('Build.ownerId', '=', userId)
		.$if(!options.showPrivate, (qb) => qb.where('Build.private', '=', 0))
		.execute();

	return rows.map((row) => {
		const abilities = dbAbilitiesToArrayOfArrays(row.abilities);

		return {
			...row,
			abilities: options.sortAbilities ? sortAbilities(abilities) : abilities
		};
	});
}

export async function allByWeaponId(
	weaponId: MainWeaponId,
	options: { limit: number; sortAbilities: boolean }
) {
	const rows = await db
		.with('BuildWeaponWithXRankInfo', (db) =>
			db
				.selectFrom('BuildWeapon')
				.innerJoin('Build', 'Build.id', 'BuildWeapon.buildId')
				.leftJoin('SplatoonPlayer', 'SplatoonPlayer.userId', 'Build.ownerId')
				.leftJoin('XRankPlacement', (join) =>
					join
						.onRef('XRankPlacement.playerId', '=', 'SplatoonPlayer.id')
						.onRef('XRankPlacement.weaponSplId', '=', 'BuildWeapon.weaponSplId')
				)
				.select(({ fn }) => [
					'BuildWeapon.buildId',
					'BuildWeapon.weaponSplId',
					fn.min('XRankPlacement.rank').as('minRank'),
					fn.max('XRankPlacement.power').as('maxPower')
				])
				.where('BuildWeapon.weaponSplId', 'in', weaponIdToArrayWithAlts(weaponId))
				.groupBy(['BuildWeapon.buildId', 'BuildWeapon.weaponSplId'])
		)
		.selectFrom('BuildWeaponWithXRankInfo')
		.innerJoin('Build', 'Build.id', 'BuildWeaponWithXRankInfo.buildId')
		.leftJoin('PlusTier', 'PlusTier.userId', 'Build.ownerId')
		.select(({ eb }) => [
			'Build.id',
			'Build.title',
			'Build.description',
			'Build.modes',
			'Build.headGearSplId',
			'Build.clothesGearSplId',
			'Build.shoesGearSplId',
			'Build.updatedAt',
			'PlusTier.tier as plusTier',
			withAbilities(eb),
			jsonArrayFrom(
				eb
					.selectFrom('BuildWeapon')
					.leftJoin('BuildWeaponWithXRankInfo', (join) =>
						join
							.onRef('BuildWeapon.weaponSplId', '=', 'BuildWeaponWithXRankInfo.weaponSplId')
							.onRef('BuildWeapon.buildId', '=', 'BuildWeaponWithXRankInfo.buildId')
					)
					.select([
						'BuildWeapon.weaponSplId',
						'BuildWeaponWithXRankInfo.maxPower',
						'BuildWeaponWithXRankInfo.minRank'
					])
					.orderBy('BuildWeapon.weaponSplId', 'asc')
					.whereRef('BuildWeapon.buildId', '=', 'Build.id')
			).as('weapons'),
			jsonObjectFrom(
				eb
					.selectFrom('User')
					.select([...COMMON_USER_FIELDS])
					.whereRef('User.id', '=', 'Build.ownerId')
			).as('owner')
		])
		.orderBy(
			(eb) =>
				eb.case().when('PlusTier.tier', 'is', null).then(4).else(eb.ref('PlusTier.tier')).end(),
			'asc'
		)
		.orderBy(
			(eb) =>
				eb.case().when('BuildWeaponWithXRankInfo.maxPower', 'is not', null).then(0).else(1).end(),
			'asc'
		)
		.orderBy('Build.updatedAt', 'desc')
		.limit(options.limit)
		.where('Build.private', '=', 0)
		.execute();

	return rows.map((row) => {
		const abilities = dbAbilitiesToArrayOfArrays(row.abilities);

		return {
			...row,
			abilities: options.sortAbilities ? sortAbilities(abilities) : abilities
		};
	});
}

function withAbilities(eb: ExpressionBuilder<DB, 'Build'>) {
	return jsonArrayFrom(
		eb
			.selectFrom('BuildAbility')
			.select(['BuildAbility.gearType', 'BuildAbility.ability', 'BuildAbility.slotIndex'])
			.whereRef('BuildAbility.buildId', '=', 'Build.id')
	).as('abilities');
}

const gearOrder: Array<Tables['BuildAbility']['gearType']> = ['HEAD', 'CLOTHES', 'SHOES'];
function dbAbilitiesToArrayOfArrays(
	abilities: Array<Pick<Tables['BuildAbility'], 'ability' | 'gearType' | 'slotIndex'>>
): BuildAbilitiesTuple {
	const sorted = abilities
		.sort((a, b) => {
			if (a.gearType === b.gearType) return a.slotIndex - b.slotIndex;

			return gearOrder.indexOf(a.gearType) - gearOrder.indexOf(b.gearType);
		})
		.map((a) => a.ability);

	invariant(sorted.length === 12, 'expected 12 abilities');

	return [
		[sorted[0], sorted[1], sorted[2], sorted[3]],
		[sorted[4], sorted[5], sorted[6], sorted[7]],
		[sorted[8], sorted[9], sorted[10], sorted[11]]
	];
}

export async function countByUserId({
	userId,
	showPrivate
}: {
	userId: number;
	showPrivate: boolean;
}) {
	return (
		await db
			.selectFrom('Build')
			.select(({ fn }) => fn.countAll<number>().as('count'))
			.where('ownerId', '=', userId)
			.$if(!showPrivate, (qb) => qb.where('Build.private', '=', 0))
			.executeTakeFirstOrThrow()
	).count;
}

export async function abilityPointAverages(weaponId?: MainWeaponId) {
	return db
		.selectFrom('BuildAbility')
		.select(({ fn }) => [
			'BuildAbility.ability',
			fn.sum<number>('BuildAbility.abilityPoints').as('abilityPointsSum')
		])
		.innerJoin('BuildWeapon', 'BuildAbility.buildId', 'BuildWeapon.buildId')
		.innerJoin('Build', 'Build.id', 'BuildWeapon.buildId')
		.$if(typeof weaponId === 'number', (qb) => qb.where('BuildWeapon.weaponSplId', '=', weaponId!))
		.groupBy('BuildAbility.ability')
		.where('Build.private', '=', 0)
		.execute();
}

interface CreateArgs {
	ownerId: TablesInsertable['Build']['ownerId'];
	title: TablesInsertable['Build']['title'];
	description: TablesInsertable['Build']['description'];
	modes: Array<ModeShort> | null;
	headGearSplId: TablesInsertable['Build']['headGearSplId'];
	clothesGearSplId: TablesInsertable['Build']['clothesGearSplId'];
	shoesGearSplId: TablesInsertable['Build']['shoesGearSplId'];
	weaponSplIds: Array<BuildWeapon['weaponSplId']>;
	abilities: BuildAbilitiesTuple;
	private: TablesInsertable['Build']['private'];
}

async function createInTrx({ args, trx }: { args: CreateArgs; trx: Transaction<DB> }) {
	const { id: buildId } = await trx
		.insertInto('Build')
		.values({
			ownerId: args.ownerId,
			title: args.title,
			description: args.description,
			modes:
				args.modes && args.modes.length > 0
					? JSON.stringify(
							args.modes.slice().sort((a, b) => modesShort.indexOf(a) - modesShort.indexOf(b))
						)
					: null,
			headGearSplId: args.headGearSplId,
			clothesGearSplId: args.clothesGearSplId,
			shoesGearSplId: args.shoesGearSplId,
			private: args.private
		})
		.returning('id')
		.executeTakeFirstOrThrow();

	await trx
		.insertInto('BuildWeapon')
		.values(
			args.weaponSplIds.map((weaponSplId) => ({
				buildId,
				weaponSplId
			}))
		)
		.execute();

	await trx
		.insertInto('BuildAbility')
		.values(
			args.abilities.flatMap((row, rowI) =>
				row.map((ability, abilityI) => ({
					buildId,
					gearType: rowI === 0 ? 'HEAD' : rowI === 1 ? 'CLOTHES' : 'SHOES',
					ability,
					slotIndex: abilityI
				}))
			)
		)
		.execute();
}

export async function create(args: CreateArgs) {
	return db.transaction().execute(async (trx) => createInTrx({ args, trx }));
}

export async function update(args: CreateArgs & { id: number }) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom('Build').where('id', '=', args.id).execute();
		await createInTrx({ args, trx });
	});
}

export function deleteById(id: number) {
	return db.deleteFrom('Build').where('id', '=', id).execute();
}

export function updateVisibilityById(args: { id: number; private: number }) {
	return db
		.updateTable('Build')
		.set({
			private: args.private
		})
		.where('id', '=', args.id)
		.execute();
}
