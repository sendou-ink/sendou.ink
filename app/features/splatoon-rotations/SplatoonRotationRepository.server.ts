import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";

type FindAllResult = Awaited<ReturnType<typeof queryAll>>;
let cachedRotations: FindAllResult | null = null;

export async function replaceAll(
	rotations: Omit<TablesInsertable["SplatoonRotation"], "id">[],
) {
	await db.transaction().execute(async (trx) => {
		await trx.deleteFrom("SplatoonRotation").execute();

		if (rotations.length > 0) {
			await trx.insertInto("SplatoonRotation").values(rotations).execute();
		}
	});

	cachedRotations = await queryAll();
}

export async function findAll() {
	if (cachedRotations) return cachedRotations;

	const result = await queryAll();
	cachedRotations = result;

	return result;
}

function queryAll() {
	return db
		.selectFrom("SplatoonRotation")
		.select([
			"SplatoonRotation.id",
			"SplatoonRotation.type",
			"SplatoonRotation.mode",
			"SplatoonRotation.stageId1",
			"SplatoonRotation.stageId2",
			"SplatoonRotation.startTime",
			"SplatoonRotation.endTime",
		])
		.orderBy("SplatoonRotation.startTime", "asc")
		.execute();
}
