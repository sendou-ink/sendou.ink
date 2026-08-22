/**
 * Hand-maintained types for the [Leanny/splat3](https://github.com/Leanny/splat3) game data dump.
 *
 * The dump itself is not checked in (see `.gitignore`), so these types are declared here rather
 * than inferred from the JSON files. That keeps `pnpm run typecheck:scripts` passing whether or
 * not the dump is currently sitting in `scripts/dicts/splat3`.
 *
 * Only the fields the scripts actually read are declared for the deeply nested parameter dumps.
 * When a monthly update changes the dump's shape, update these types alongside the scripts.
 */

/** `data/language/<Lang>.json` — message category -> message key -> localized (URI encoded) text. */
export type LangDict = Record<string, Record<string, string>>;

interface WeaponInfoEntry {
	DefaultDamageRateInfoRow: string;
	DefaultHitEffectorType: string;
	ExtraDamageRateInfoRowSet: Array<{
		DamageRateInfoRow: string;
		ExtraInfo: string;
	}>;
	ExtraHitEffectorInfoSet: Array<{
		ExtraInfo: string;
		HitEffectorType: string;
	}>;
	Id: number;
	Label: string;
	NpcActor: string;
	SpecActor: string;
	Type: string;
	__RowId: string;
}

/** `data/mush/<version>/WeaponInfoMain.json` */
export interface WeaponInfoMainEntry extends WeaponInfoEntry {
	DebugDispColumn: number;
	DebugDispOrder: number;
	GameActor: string;
	IsCoopRare: boolean;
	LObjParam: string;
	LockerContentInfo: string[];
	LockerModelColor: { A: number; B: number; G: number; R: number };
	MatchingId: number;
	Range: number;
	RewardLv2: string;
	RewardLv3: string;
	Season: number;
	ShopPrice: number;
	ShopUnlockRank: number;
	SpecialPoint: number;
	SpecialWeapon: string;
	SubWeapon: string;
	UIParam: Array<{ Type: string; Value: number }>;
	WeaponInfoForCoop: string;
}

/** `data/mush/<version>/WeaponInfoSub.json` */
export interface WeaponInfoSubEntry extends WeaponInfoEntry {
	LockerGoodsSubWeaponInfo: string;
}

/** `data/mush/<version>/WeaponInfoSpecial.json` */
export interface WeaponInfoSpecialEntry extends WeaponInfoEntry {
	StandAlone: boolean;
}

/** `data/mush/<version>/GearInfo{Head,Clothes,Shoes}.json` — all three share one shape. */
export interface GearInfoEntry {
	AlphaMaskF: string;
	AlphaMaskM: string;
	AlphaMaskV1: string;
	Brand: string;
	CallSign: number;
	CallSignPriority: number;
	CaptureModelType: string;
	Genre0: string;
	Genre1: string;
	HarnessType: string;
	HeadParamSetPath: string;
	HowToGet: string;
	Id: number;
	IsHideHarness: boolean;
	IsThinHarness: boolean;
	IsUnisex: boolean;
	LObjParam: string;
	LObjParamM: string;
	Label: string;
	Material: string;
	Price: number;
	Rarity: number;
	Season: number;
	Skill: string;
	UrokoPrice: {
		BronzeUrokoNum: number;
		GoldUrokoNum: number;
		SilverUrokoNum: number;
	};
	UrokoUnlockLevel: number;
	VariationNum: number;
	__RowId: string;
}

/** `data/parameter/<version>/misc/SplPlayer.game__GameParameterTable.json` */
export interface SplPlayerParams {
	GameParameters: {
		spl__PlayerBeaconSubSpecUpParam: {
			SubSpecUpParam: { High: number; Mid: number };
		};
	};
}

/**
 * `data/parameter/<version>/misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json`
 *
 * `DamageRate` is absent for cells that take no damage rate modifier.
 */
export interface DamageRateInfoConfig {
	CellList: Record<
		string,
		{
			ColumnKey: string;
			DamageRate?: number;
			RowKey: string;
		}
	>;
	TableType: string;
}
