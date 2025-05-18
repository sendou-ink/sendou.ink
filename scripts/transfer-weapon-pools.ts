import "dotenv/config";
import { db } from "~/db/sql";
import { logger } from "~/utils/logger";

async function main() {
	const weaponPools = await db
		.selectFrom("UserWeapon")
		.select([
			"UserWeapon.userId",
			"UserWeapon.weaponSplId",
			"UserWeapon.userId",
		])
		.where("UserWeapon.order", "!=", 5)
		.orderBy("UserWeapon.order", "asc")
		.execute();

	// group by userId
	const weaponPoolsByUserId = weaponPools.reduce(
		(acc, weaponPool) => {
			if (!acc[weaponPool.userId]) {
				acc[weaponPool.userId] = [];
			}

			acc[weaponPool.userId].push(weaponPool);

			return acc;
		},
		{} as Record<string, typeof weaponPools>,
	);

	for (const [userId, weaponPools] of Object.entries(weaponPoolsByUserId)) {
		const weaponPoolIds = weaponPools.map(
			(weaponPool) => weaponPool.weaponSplId,
		);

		await db
			.updateTable("User")
			.set({
				qWeaponPool: JSON.stringify(weaponPoolIds),
			})
			.where("User.id", "=", Number(userId))
			.execute();
	}

	logger.info("done with the transfer");
}

void main();
