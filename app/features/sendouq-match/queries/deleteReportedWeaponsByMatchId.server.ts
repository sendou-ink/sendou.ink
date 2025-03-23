import { sql } from "~/db/sql";

const deleteStm = sql.prepare(/* sql */ `
  delete from "ReportedWeapon"
  where "groupMatchMapId" = @groupMatchMapId
`);

const getGroupMatchMapsStm = sql.prepare(/* sql */ `
  select "id" from "GroupMatchMap"
  where "matchId" = @matchId
`);

export const deleteReporterWeaponsByMatchId = (matchId: number) => {
	const groupMatchMaps = getGroupMatchMapsStm.all({ matchId }) as Array<{
		id: number;
	}>;

	for (const { id } of groupMatchMaps) {
		deleteStm.run({ groupMatchMapId: id });
	}
};
