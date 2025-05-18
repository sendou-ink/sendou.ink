// when adding new stage id also update the array in create-misc-json.ts and regenerate the jsons
export const stageIds = [
	0, // Scorch Gorge
	1, // Eeltail Alley
	2, // Hagglefish Market
	3, // Undertow Spillway
	4, // Mincemeat Metalworks
	5, // Hammerhead Bridge
	6, // Museum d'Alfonsino
	7, // Mahi-Mahi Resort
	8, // Inkblot Art Academy
	9, // Sturgeon Shipyard
	10, // MakoMart
	11, // Wahoo World
	12, // Flounder Heights
	13, // Brinewater Springs
	14, // Manta Maria
	15, // Um'ami Ruins
	16, // Humpback Pump Track
	17, // Barnacle & Dime
	18, // Crableg Capital
	19, // Shipshape Cargo Co.
	20, // Bluefin Depot
	21, // Robo ROM-en
	22, // Marlin Airport
	23, // Lemuria Hub
] as const;

export const stagesObj = {
	SCORCH_GORGE: 0,
	EELTAIL_ALLEY: 1,
	HAGGLEFISH_MARKET: 2,
	UNDERTOW_SPILLWAY: 3,
	MINCEMEAT_METALWORKS: 4,
	HAMMERHEAD_BRIDGE: 5,
	MUSEUM_D_ALFONSINO: 6,
	MAHI_MAHI_RESORT: 7,
	INKBLOT_ART_ACADEMY: 8,
	STURGEON_SHIPYARD: 9,
	MAKOMART: 10,
	WAHOO_WORLD: 11,
	FLOUNDER_HEIGHTS: 12,
	BRINEWATER_SPRINGS: 13,
	MANTA_MARIA: 14,
	UM_AMI_RUINS: 15,
	HUMPBACK_PUMP_TRACK: 16,
	BARNACLE_AND_DIME: 17,
	CRABLEG_CAPITAL: 18,
	SHIPSHAPE_CARGO_CO: 19,
	BLUEFIN_DEPOT: 20,
	ROBO_ROM_EN: 21,
	MARLIN_AIRPORT: 22,
	LEMURIA_HUB: 23,
} as const;
