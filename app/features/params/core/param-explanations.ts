// xxx: make these translateable?

/**
 * Plain-English explanations of raw weapon parameters, keyed by `${category}.${key}`.
 *
 * These are reconstructed by correlating Nintendo's official Splatoon 3 patch notes
 * against the per-version value history we store. Only keys
 * with a non-empty value below show a help popover on the params page.
 *
 * Every parameter the table can display is listed here. Filled-in entries are active;
 * the rest are commented out as placeholders — uncomment one and write its meaning to
 * add a popover for it.
 */
const PARAM_EXPLANATIONS: Record<string, string> = {
	// BlasterBurstJumpParam
	// "BlasterBurstJumpParam.BurstFrame": "",
	// "BlasterBurstJumpParam.MoveLength": "",
	// "BlasterBurstJumpParam.ShotCollisionHitRadiusRate": "",
	// "BlasterBurstJumpParam.SplashDropPaintRadius": "",
	// "BlasterBurstJumpParam.SplashDropPaintShotColHitRadius": "",
	// "BlasterBurstJumpParam.SplashPaintRadius": "",
	// "BlasterBurstJumpParam.SplashPaintShotColHitRadius": "",
	// "BlasterBurstJumpParam.WallHitPaintRadius": "",

	// BlasterBurstParam
	// "BlasterBurstParam.BurstFrame": "",
	// "BlasterBurstParam.MoveLength": "",
	// "BlasterBurstParam.ShotCollisionHitRadiusRate": "",
	// "BlasterBurstParam.SplashDropPaintRadius": "",
	// "BlasterBurstParam.SplashDropPaintShotColHitRadius": "",
	// "BlasterBurstParam.SplashPaintRadius": "",
	// "BlasterBurstParam.SplashPaintShotColHitRadius": "",
	// "BlasterBurstParam.WallHitPaintRadius": "",

	// BlastJumpParam
	// "BlastJumpParam.CrossPaintCheckLength": "",
	// "BlastJumpParam.CrossPaintRadius": "",
	// "BlastJumpParam.PaintRadius": "",

	// BlastParam
	// "BlastParam.CrossPaintCheckLength": "",
	// "BlastParam.CrossPaintRadius": "",
	// "BlastParam.DistanceFar": "",
	// "BlastParam.DistanceNear": "",
	// "BlastParam.PaintRadius": "",
	// "BlastParam.PaintRadiusFar": "",
	// "BlastParam.PaintRadiusNear": "",

	// BodyParam
	// "BodyParam.Damage": "",

	// BulletAdditionMovePlayerSplashNearestParam
	// "BulletAdditionMovePlayerSplashNearestParam.XRate": "",
	// "BulletAdditionMovePlayerSplashNearestParam.YPlusRate": "",
	// "BulletAdditionMovePlayerSplashNearestParam.ZRate": "",

	// CollisionLapOverParam
	// "CollisionLapOverParam.ChangeFrameForField": "",
	// "CollisionLapOverParam.ChangeFrameForPlayer": "",
	// "CollisionLapOverParam.EndRadiusForField": "",
	// "CollisionLapOverParam.EndRadiusForPlayer": "",
	// "CollisionLapOverParam.FriendThroughFrameForPlayer": "",
	// "CollisionLapOverParam.InitRadiusForField": "",
	// "CollisionLapOverParam.InitRadiusForPlayer": "",

	// CollisionParam
	// "CollisionParam.ChangeFrameForField": "",
	// "CollisionParam.ChangeFrameForPlayer": "",
	// "CollisionParam.EndRadiusForField": "",
	// "CollisionParam.EndRadiusForPlayer": "",
	// "CollisionParam.FriendThroughFrameForPlayer": "",
	// "CollisionParam.InitRadiusForField": "",
	// "CollisionParam.InitRadiusForPlayer": "",

	// DamageJumpParam
	// "DamageJumpParam.ReduceEndFrame": "",
	// "DamageJumpParam.ReduceStartFrame": "",
	// "DamageJumpParam.ValueMax": "",
	// "DamageJumpParam.ValueMin": "",

	// DamageLapOverParam
	// "DamageLapOverParam.ReduceEndFrame": "",
	// "DamageLapOverParam.ReduceStartFrame": "",
	// "DamageLapOverParam.ValueMax": "",
	// "DamageLapOverParam.ValueMin": "",

	// DamageParam
	// "DamageParam.ReduceEndFrame": "",
	// "DamageParam.ReduceStartFrame": "",
	// "DamageParam.ValueFullCharge": "",
	// "DamageParam.ValueFullChargeMax": "",
	"DamageParam.ValueMax":
		"Maximum direct-hit damage. Stored ×10 in the game data, so 450 means 45.0 damage.",
	// "DamageParam.ValueMaxCharge": "",
	"DamageParam.ValueMin":
		"Minimum direct-hit damage after full damage falloff at range. Stored ×10, so 225 means 22.5 damage.",
	// "DamageParam.ValueMinCharge": "",

	// MainEffectiveRangeUpParam
	// "MainEffectiveRangeUpParam.BaseDistance": "",
	// "MainEffectiveRangeUpParam.High": "",
	// "MainEffectiveRangeUpParam.Mid": "",

	// MainWeaponSetting
	// "MainWeaponSetting.Overwrite_ConsumeRt_Main_High": "",
	// "MainWeaponSetting.Overwrite_ConsumeRt_Main_Low": "",
	// "MainWeaponSetting.Overwrite_ConsumeRt_Main_Mid": "",
	// "MainWeaponSetting.Overwrite_MoveVelRt_Shot_High": "",
	// "MainWeaponSetting.Overwrite_MoveVelRt_Shot_Low": "",
	// "MainWeaponSetting.Overwrite_MoveVelRt_Shot_Mid": "",
	// "MainWeaponSetting.WeaponAccType": "",
	// "MainWeaponSetting.WeaponSpeedType": "",

	// MoveJumpParam
	// "MoveJumpParam.GoStraightStateEndMaxSpeed": "",
	// "MoveJumpParam.GoStraightToBrakeStateFrame": "",
	// "MoveJumpParam.SpawnSpeed": "",

	// MoveLapOverParam
	// "MoveLapOverParam.GoStraightStateEndMaxSpeed": "",
	// "MoveLapOverParam.GoStraightToBrakeStateFrame": "",
	// "MoveLapOverParam.SpawnSpeed": "",

	// MoveParam
	// "MoveParam.DistanceFullCharge": "",
	// "MoveParam.DistanceMaxCharge": "",
	// "MoveParam.DistanceMinCharge": "",
	// "MoveParam.FreeAirResist": "",
	// "MoveParam.FreeGravity": "",
	"MoveParam.GoStraightStateEndMaxSpeed":
		"Speed a shot settles to after its initial fast phase, which affects its effective range.",
	// "MoveParam.GoStraightToBrakeStateFrame": "",
	"MoveParam.SpawnSpeed":
		"Initial travel speed of a shot the moment it is fired.",
	// "MoveParam.SpawnSpeedFirstLastAndSecond": "",
	// "MoveParam.SpawnSpeedFullCharge": "",
	// "MoveParam.SpawnSpeedMaxCharge": "",
	// "MoveParam.SpawnSpeedMinCharge": "",
	// "MoveParam.SpawnSpeedRandomBias": "",
	// "MoveParam.SpawnSpeedRandomRate": "",

	// PaintParam
	// "PaintParam.DegreeUseDepthScaleMin": "",
	// "PaintParam.DepthScaleMax": "",
	// "PaintParam.DepthScaleMaxBreakFree": "",
	// "PaintParam.DepthScaleMin": "",
	// "PaintParam.DepthScaleMinBreakFree": "",
	// "PaintParam.DistanceFar": "",
	// "PaintParam.DistanceMiddle": "",
	// "PaintParam.DistanceNear": "",
	// "PaintParam.HeightUseDepthScaleMaxBreakFree": "",
	// "PaintParam.HeightUseDepthScaleMinBreakFree": "",
	// "PaintParam.RadiusFullCharge": "",
	// "PaintParam.RadiusMaxCharge": "",
	// "PaintParam.RadiusMinCharge": "",
	"PaintParam.WidthHalfFar":
		"Half-width of the ink mark a shot leaves when landing at far range.",
	"PaintParam.WidthHalfMiddle":
		"Half-width of the ink mark a shot leaves when landing at medium range.",
	"PaintParam.WidthHalfNear":
		"Half-width of the ink mark a shot leaves when landing at close range.",

	// SideStepParam
	// "SideStepParam.ChargeFrame": "",
	"SideStepParam.InkConsume":
		"Ink used by a single Dodge Roll, as a fraction of the ink tank.",
	// "SideStepParam.InkRecoverStop": "",
	// "SideStepParam.MoveDist": "",
	// "SideStepParam.MoveFrame": "",
	// "SideStepParam.MoveStepKd_Air": "",
	// "SideStepParam.RepeatCnt": "",
	// "SideStepParam.SlipMoveDistAir": "",
	// "SideStepParam.SlipMoveDistGnd": "",
	// "SideStepParam.SlipMoveFrame": "",
	// "SideStepParam.UnrelaxFrameMove": "",
	// "SideStepParam.UnrelaxFrameMove_Last": "",
	// "SideStepParam.UnrelaxFrameNoSideStep": "",
	// "SideStepParam.UnrelaxFrameNoSideStep_Last": "",
	// "SideStepParam.UnrelaxFrameNoSquid": "",
	// "SideStepParam.UnrelaxFrameNoSquid_Last": "",
	// "SideStepParam.UnrelaxFrameNoWeapon": "",
	// "SideStepParam.UnrelaxFrameNoWeapon_Last": "",
	// "SideStepParam.UnrelaxFrameOneMuzzle": "",
	// "SideStepParam.UnrelaxFrameOneMuzzle_Last": "",

	// spl__BulletShelterCanopyParam
	// "spl__BulletShelterCanopyParam.CanopyAttackedDamageRate": "",
	// "spl__BulletShelterCanopyParam.CanopyColRadius": "",
	// "spl__BulletShelterCanopyParam.CanopyCureHPPerFrame": "",
	// "spl__BulletShelterCanopyParam.CanopyDamage": "",
	// "spl__BulletShelterCanopyParam.CanopyFrame": "",
	// "spl__BulletShelterCanopyParam.CanopyGravity": "",
	// "spl__BulletShelterCanopyParam.CanopyHitOtherCanopyDamage": "",
	// "spl__BulletShelterCanopyParam.CanopyHitOtherCanopyVolume": "",
	// "spl__BulletShelterCanopyParam.CanopyHitShieldAttackDamage": "",
	// "spl__BulletShelterCanopyParam.CanopyHitShieldReceiveDamage": "",
	"spl__BulletShelterCanopyParam.CanopyHP":
		"Hit points of the Brella's canopy. Different weapons deal different damage multipliers against it, so check the Object Damage Calculator to see how fast a given weapon breaks it.",
	// "spl__BulletShelterCanopyParam.CanopyInitSpeed": "",
	// "spl__BulletShelterCanopyParam.CanopyMoveKnockBackSideStepRate": "",
	"spl__BulletShelterCanopyParam.CanopyNakedFrame":
		"Time in frames (60 = 1 second) for a broken canopy to recover.",
	// "spl__BulletShelterCanopyParam.CanopyPaintRadius": "",
	// "spl__BulletShelterCanopyParam.CanopySpeedAirAddScaleXZ": "",
	// "spl__BulletShelterCanopyParam.CanopySpeedGroundAddScale": "",
	// "spl__BulletShelterCanopyParam.FootSplashPaintRadius": "",
	// "spl__BulletShelterCanopyParam.FootSplashShapeCastOffset": "",
	// "spl__BulletShelterCanopyParam.FootSplashSpanFrame": "",
	// "spl__BulletShelterCanopyParam.FootSplashWaitFrame": "",

	// spl__BulletShelterShotgunParam
	// "spl__BulletShelterShotgunParam.DamageEffectiveTotalMax": "",

	// spl__BulletShooterTailLengthParam
	// "spl__BulletShooterTailLengthParam.MaxLengthFrame": "",

	// spl__PlayerGearSkillParam_ActionSpecUp_ReduceJumpSwerveRate
	// "spl__PlayerGearSkillParam_ActionSpecUp_ReduceJumpSwerveRate.Mid": "",

	// spl__SpawnBulletAdditionMovePlayerParam
	// "spl__SpawnBulletAdditionMovePlayerParam.XRate": "",
	// "spl__SpawnBulletAdditionMovePlayerParam.YMinusRate": "",
	// "spl__SpawnBulletAdditionMovePlayerParam.YPlusRate": "",
	// "spl__SpawnBulletAdditionMovePlayerParam.ZRate": "",

	// spl__WeaponShelterCanopyParam
	// "spl__WeaponShelterCanopyParam.CanopyChargeFrame": "",
	// "spl__WeaponShelterCanopyParam.CanopyDirXZ_DiffDeg_H": "",
	// "spl__WeaponShelterCanopyParam.CanopyDirXZ_DiffDeg_L": "",
	// "spl__WeaponShelterCanopyParam.CanopyDirXZ_RotDeg_H": "",
	// "spl__WeaponShelterCanopyParam.CanopyDirXZ_RotDeg_L": "",
	// "spl__WeaponShelterCanopyParam.CanopyDirXZ_RotDegBias": "",
	"spl__WeaponShelterCanopyParam.CanopyNakedFrame":
		"Time in frames (60 = 1 second) for a broken canopy to recover.",
	// "spl__WeaponShelterCanopyParam.CanopyOpenEndBias": "",
	// "spl__WeaponShelterCanopyParam.CanopyOpenEndOffset": "",
	// "spl__WeaponShelterCanopyParam.CanopyOpenFrame": "",
	// "spl__WeaponShelterCanopyParam.CanopyOpenStartOffset": "",
	// "spl__WeaponShelterCanopyParam.CanopyShotFrame": "",
	"spl__WeaponShelterCanopyParam.InkConsumeUmbrella":
		"Ink used to launch the canopy, as a fraction of the ink tank.",

	// spl__WeaponShelterShotgunParam
	"spl__WeaponShelterShotgunParam.InkConsume":
		"Ink used per shot for shotgun-style Brella weapons, as a fraction of the ink tank.",
	// "spl__WeaponShelterShotgunParam.InkRecoverStop": "",
	// "spl__WeaponShelterShotgunParam.InkRecoverStopCanopy": "",
	// "spl__WeaponShelterShotgunParam.InkRecoverStopCharge": "",
	"spl__WeaponShelterShotgunParam.JumpGndCharge":
		"Jump height while holding ZR to fire. Higher means you can jump higher while firing.",
	// "spl__WeaponShelterShotgunParam.MoveSpeed": "",
	// "spl__WeaponShelterShotgunParam.MoveSpeedCharge": "",
	// "spl__WeaponShelterShotgunParam.PostDelayFrame_Main": "",
	// "spl__WeaponShelterShotgunParam.PostDelayFrame_MoveLmt": "",
	// "spl__WeaponShelterShotgunParam.PostNoShotReqFrame": "",
	// "spl__WeaponShelterShotgunParam.PreDelayFrame_HumanMain": "",
	// "spl__WeaponShelterShotgunParam.PreDelayFrame_SquidMain": "",
	// "spl__WeaponShelterShotgunParam.RepeatFrame": "",
	// "spl__WeaponShelterShotgunParam.ShotGuideFrame": "",

	// SplashPaintParam
	// "SplashPaintParam.DepthHalfFullCharge": "",
	// "SplashPaintParam.DepthHalfMaxCharge": "",
	// "SplashPaintParam.DepthHalfMinCharge": "",
	// "SplashPaintParam.DepthMaxDropHeight": "",
	// "SplashPaintParam.DepthMinDropHeight": "",
	// "SplashPaintParam.DepthScaleMax": "",
	// "SplashPaintParam.DepthScaleMin": "",
	// "SplashPaintParam.LastSplashRateFullCharge": "",
	// "SplashPaintParam.LastSplashRateMaxCharge": "",
	// "SplashPaintParam.LastSplashRateMinCharge": "",
	// "SplashPaintParam.RadiusSpawnNearest": "",
	"SplashPaintParam.WidthHalf":
		"Half-width of the ink trail painted by a shot's spray droplets.",
	"SplashPaintParam.WidthHalfFullCharge":
		"Half-width of the ink trail painted by a fully charged shot's spray droplets.",
	// "SplashPaintParam.WidthHalfMaxCharge": "",
	"SplashPaintParam.WidthHalfMinCharge":
		"Half-width of the ink trail painted by a tap shot's (minimum charge) spray droplets.",
	// "SplashPaintParam.WidthHalfNearest": "",

	// SplashSlosherScatterParam
	// "SplashSlosherScatterParam.PaintRadius": "",
	// "SplashSlosherScatterParam.SpawnFirstFrame": "",
	// "SplashSlosherScatterParam.SpawnMaxDegree": "",
	// "SplashSlosherScatterParam.SpawnMaxNum": "",
	// "SplashSlosherScatterParam.SpawnMinDegree": "",
	// "SplashSlosherScatterParam.SpawnOffsetMax": "",
	// "SplashSlosherScatterParam.SpawnOffsetMin": "",
	// "SplashSlosherScatterParam.SpawnSpanChangeEndFrame": "",
	// "SplashSlosherScatterParam.SpawnSpanFrameFirst": "",
	// "SplashSlosherScatterParam.SpawnSpanFrameLast": "",
	// "SplashSlosherScatterParam.SpawnSpeed": "",

	// SplashSlosherSpiralParam
	// "SplashSlosherSpiralParam.LifeFrame": "",
	// "SplashSlosherSpiralParam.RoundSplitNum": "",
	// "SplashSlosherSpiralParam.SameTimeSpawnNum": "",
	// "SplashSlosherSpiralParam.SpawnSpanChangeEndFrame": "",
	// "SplashSlosherSpiralParam.SpawnSpanChangeStartFrame": "",
	// "SplashSlosherSpiralParam.SpawnSpanFrameFirst": "",
	// "SplashSlosherSpiralParam.SpawnSpanFrameLast": "",
	// "SplashSlosherSpiralParam.SpawnSpeedChangeEndFallHeight": "",
	// "SplashSlosherSpiralParam.SpawnSpeedChangeStartFallHeight": "",
	// "SplashSlosherSpiralParam.SpawnSpeedFirst": "",
	// "SplashSlosherSpiralParam.SpawnSpeedLast": "",

	// SplashSpawnLapOverParam
	// "SplashSpawnLapOverParam.SpawnBetweenLength": "",
	// "SplashSpawnLapOverParam.SpawnNearestLength": "",
	// "SplashSpawnLapOverParam.SpawnNum": "",
	// "SplashSpawnLapOverParam.SplitNum": "",

	// SplashSpawnParam
	// "SplashSpawnParam.OnTopRateFullCharge": "",
	// "SplashSpawnParam.OnTopRateMaxCharge": "",
	// "SplashSpawnParam.OnTopRateMinCharge": "",
	// "SplashSpawnParam.RandomSpawnVelXMax": "",
	// "SplashSpawnParam.RandomSpawnVelYMax": "",
	// "SplashSpawnParam.RandomSpawnVelZMax": "",
	// "SplashSpawnParam.RandomSpawnVelZMin": "",
	// "SplashSpawnParam.SkipNum": "",
	"SplashSpawnParam.SpawnBetweenLength":
		"Spacing between the spray droplets a shot drops along its path (the inking at the player's feet is controlled separately).",
	// "SplashSpawnParam.SpawnNearestChargeRate": "",
	// "SplashSpawnParam.SpawnNearestLength": "",
	// "SplashSpawnParam.SpawnNearestMaxOffsetXZ": "",
	"SplashSpawnParam.SpawnNum":
		"Number of spray droplets a shot creates along its path. The inking that occurs at the player's feet is controlled separately.",
	"SplashSpawnParam.SplitNum":
		"Affects how likely ink splatter is to fall around the player's feet (higher is likelier)",

	// SwingUnitGroupParam
	// "SwingUnitGroupParam.PushOutCheckFieldCollisionFrame": "",

	// VariableCollisionParam
	// "VariableCollisionParam.EndRadiusForPlayer": "",
	// "VariableCollisionParam.InitRadiusForPlayer": "",

	// VariableDamageParam
	// "VariableDamageParam.ReduceEndFrame": "",
	// "VariableDamageParam.ReduceStartFrame": "",
	// "VariableDamageParam.ValueFullChargeMax": "",
	// "VariableDamageParam.ValueMax": "",
	// "VariableDamageParam.ValueMin": "",

	// VariableMoveParam
	// "VariableMoveParam.GoStraightStateEndMaxSpeed": "",
	// "VariableMoveParam.GoStraightToBrakeStateFrame": "",
	// "VariableMoveParam.SpawnSpeed": "",
	// "VariableMoveParam.SpawnSpeedFirstLastAndSecond": "",
	// "VariableMoveParam.SpawnSpeedRandomBias": "",
	// "VariableMoveParam.SpawnSpeedRandomRate": "",

	// VariablePaintParam
	// "VariablePaintParam.DepthScaleMax": "",
	// "VariablePaintParam.DepthScaleMaxBreakFree": "",
	// "VariablePaintParam.DepthScaleMin": "",
	// "VariablePaintParam.DepthScaleMinBreakFree": "",
	// "VariablePaintParam.DistanceFar": "",
	// "VariablePaintParam.DistanceMiddle": "",
	// "VariablePaintParam.DistanceNear": "",
	// "VariablePaintParam.HeightUseDepthScaleMaxBreakFree": "",
	// "VariablePaintParam.WidthHalfFar": "",
	// "VariablePaintParam.WidthHalfMiddle": "",
	// "VariablePaintParam.WidthHalfNear": "",

	// VariableShotParam
	// "VariableShotParam.Jump_DegBiasDecreaseStartFrame": "",
	// "VariableShotParam.Jump_DegBiasEndFrame": "",
	// "VariableShotParam.Jump_DegBiasMax": "",
	// "VariableShotParam.Jump_DegSwerve": "",
	// "VariableShotParam.MoveSpeed": "",
	// "VariableShotParam.PitchDegBias": "",
	// "VariableShotParam.PitchDegSwerve": "",
	// "VariableShotParam.RepeatFrame": "",
	// "VariableShotParam.Stand_DegBiasMax": "",
	// "VariableShotParam.Stand_DegSwerve": "",
	// "VariableShotParam.VariableInterpolatedFrame": "",

	// VariableSplashPaintParam
	// "VariableSplashPaintParam.DepthScaleMax": "",
	// "VariableSplashPaintParam.DepthScaleMin": "",
	// "VariableSplashPaintParam.WidthHalf": "",
	// "VariableSplashPaintParam.WidthHalfNearest": "",

	// VariableSplashSpawnParam
	// "VariableSplashSpawnParam.SpawnBetweenLength": "",
	// "VariableSplashSpawnParam.SpawnNearestLength": "",
	// "VariableSplashSpawnParam.SpawnNum": "",
	// "VariableSplashSpawnParam.SplitNum": "",

	// VariableWeaponParam
	// "VariableWeaponParam.BurstAimMoveFrame": "",
	// "VariableWeaponParam.InkConsume": "",
	// "VariableWeaponParam.Jump_DegBiasDecreaseStartFrame": "",
	// "VariableWeaponParam.Jump_DegBiasEndFrame": "",
	// "VariableWeaponParam.Jump_DegBiasMax": "",
	// "VariableWeaponParam.Jump_DegSwerve": "",
	// "VariableWeaponParam.MoveSpeed": "",
	// "VariableWeaponParam.PostDelayFrame": "",
	// "VariableWeaponParam.RepeatFrame": "",
	// "VariableWeaponParam.ShotGuideFrame": "",
	// "VariableWeaponParam.Stand_DegBiasDecrease": "",
	// "VariableWeaponParam.Stand_DegBiasKf": "",
	// "VariableWeaponParam.Stand_DegBiasMin": "",
	// "VariableWeaponParam.Stand_DegSwerve": "",

	// VerticalSwingUnitGroupParam
	// "VerticalSwingUnitGroupParam.SpawnSplashBetweenLength": "",
	// "VerticalSwingUnitGroupParam.SpawnSplashFirstLength": "",
	// "VerticalSwingUnitGroupParam.SpawnSplashNum": "",

	// WallDropCollisionPaintParam
	// "WallDropCollisionPaintParam.FallPeriodFirstSecondTargetAlp": "",
	// "WallDropCollisionPaintParam.PaintRadiusFall": "",
	// "WallDropCollisionPaintParam.PaintRadiusFallMaxCharge": "",
	// "WallDropCollisionPaintParam.PaintRadiusFallMinCharge": "",
	// "WallDropCollisionPaintParam.PaintRadiusGround": "",
	// "WallDropCollisionPaintParam.PaintRadiusShock": "",
	// "WallDropCollisionPaintParam.PaintRadiusShockMaxCharge": "",
	// "WallDropCollisionPaintParam.PaintRadiusShockMinCharge": "",

	// WallDropMoveParam
	// "WallDropMoveParam.FallPeriodFirstFrameMax": "",
	// "WallDropMoveParam.FallPeriodFirstFrameMin": "",
	// "WallDropMoveParam.FallPeriodFirstTargetSpeed": "",
	// "WallDropMoveParam.FallPeriodLastFrameMax": "",
	// "WallDropMoveParam.FallPeriodLastFrameMin": "",
	// "WallDropMoveParam.FallPeriodSecondFrame": "",
	// "WallDropMoveParam.FallPeriodSecondTargetSpeed": "",
	// "WallDropMoveParam.FreeGravityType": "",

	// WeaponDivideChargerParam
	// "WeaponDivideChargerParam.FullChargeDivideNum": "",

	// WeaponFullChargeParam
	// "WeaponFullChargeParam.MaxShootingFrame_Second": "",
	// "WeaponFullChargeParam.RepeatFrame": "",

	// WeaponKeepChargeParam
	// "WeaponKeepChargeParam.KeepChargeFullFrame": "",
	// "WeaponKeepChargeParam.KeepChargePreDelayFrame": "",
	// "WeaponKeepChargeParam.KeepChargePreDelayFrame_Pre": "",

	// WeaponParam
	// "WeaponParam.AirChargeRateByInkEmpty": "",
	// "WeaponParam.BurstAimMoveFrame": "",
	"WeaponParam.ChargeFrame_First":
		"Frames (60 = 1 second) until the first charge level finishes. Lower means it reaches the first level faster.",
	"WeaponParam.ChargeFrame_Second":
		"Frames (60 = 1 second) until the second, full charge level finishes. Lower means it reaches a full charge faster.",
	"WeaponParam.ChargeFrameFullCharge":
		"Frames (60 = 1 second) needed to reach a full charge. Lower means the weapon charges faster.",
	// "WeaponParam.ChargeFrameMidCharge": "",
	// "WeaponParam.ChargeFrameMinCharge": "",
	// "WeaponParam.FrameOffsetDegreeRate": "",
	// "WeaponParam.FrameOffsetMaxDegree": "",
	// "WeaponParam.FrameOffsetMaxMoveLength": "",
	// "WeaponParam.FreezeFrameFullCharge": "",
	// "WeaponParam.FreezeFrameMinCharge": "",
	"WeaponParam.InkConsume":
		"Ink used per shot, as a fraction of the ink tank (1.0 = the whole tank).",
	"WeaponParam.InkConsumeFullCharge":
		"Ink used by a fully charged shot, as a fraction of the ink tank (1.0 = the whole tank).",
	"WeaponParam.InkConsumeMinCharge":
		"Ink used by a tap shot (minimum charge), as a fraction of the ink tank (1.0 = the whole tank).",
	// "WeaponParam.InkEmptyChargeTimes": "",
	"WeaponParam.InkRecoverStop":
		'Frames (60 = 1 second) after firing before the ink tank starts refilling ("white ink"). Higher means a longer wait before ink recovery begins.',
	// "WeaponParam.Jump_DegBiasDecreaseStartFrame": "",
	// "WeaponParam.Jump_DegBiasEndFrame": "",
	// "WeaponParam.Jump_DegBiasMax": "",
	"WeaponParam.Jump_DegSwerve":
		"Shot spread in degrees while jumping. Lower is more accurate.",
	// "WeaponParam.JumpGnd_Charge": "",
	// "WeaponParam.JumpHeightFullCharge": "",
	// "WeaponParam.LapOver_DegSwerve": "",
	// "WeaponParam.LapOver_RepeatFrame": "",
	"WeaponParam.MaxShootingFrame_First":
		"Firing duration in frames (60 = 1 second) at the first charge level.",
	"WeaponParam.MaxShootingFrame_Second":
		"Firing duration in frames (60 = 1 second) at the second/full charge level.",
	// "WeaponParam.MoveJumpDownBias": "",
	// "WeaponParam.MoveJumpDownStartChargeRate": "",
	// "WeaponParam.MoveLmtFrame": "",
	"WeaponParam.MoveSpeed":
		"Player movement speed while firing. Higher means you can strafe faster while shooting.",
	"WeaponParam.MoveSpeed_Charge":
		"Player movement speed while charging a shot. Higher means you can strafe faster while charging.",
	"WeaponParam.MoveSpeedFullCharge":
		"Movement speed while charging or firing at full charge.",
	// "WeaponParam.PitchDegBias": "",
	// "WeaponParam.PitchDegSwerve": "",
	// "WeaponParam.PostDelayFrame": "",
	"WeaponParam.PostDelayFrame_Blaster":
		"Frames (60 = 1 second) of restricted movement after firing a blaster shot. Higher means a longer recovery before you can move freely again.",
	// "WeaponParam.PreDelayFrame_HumanShot": "",
	// "WeaponParam.PreDelayFrame_SquidShot": "",
	"WeaponParam.RepeatFrame":
		"Interval in frames (60 = 1 second) between consecutive shots when firing continuously. Lower means a faster fire rate.",
	// "WeaponParam.ShotGuideFrame": "",
	// "WeaponParam.SquidShotShorteningFrame": "",
	// "WeaponParam.Stand_DegBiasDecrease": "",
	// "WeaponParam.Stand_DegBiasKf": "",
	// "WeaponParam.Stand_DegBiasMax": "",
	// "WeaponParam.Stand_DegBiasMin": "",
	"WeaponParam.Stand_DegSwerve":
		"Shot spread in degrees while standing on the ground. Lower is more accurate.",
	// "WeaponParam.SwingLiftAnimFrame": "",
	// "WeaponParam.SwingLiftFrame": "",
	// "WeaponParam.TripleShotSpanFrame": "",
	// "WeaponParam.VariableShotRepeatStartFrame": "",
	// "WeaponParam.VelGnd_Bias_Charge": "",
	// "WeaponParam.VelGnd_DownRt_Charge": "",

	// WeaponRollParam
	"WeaponRollParam.DashFrame":
		"Frames (60 = 1 second) of acceleration before reaching top speed while holding ZR to ink and move forward. Lower means you reach top speed sooner.",
	// "WeaponRollParam.InkConsumeMaxPerFrame": "",
	// "WeaponRollParam.InkConsumeMinPerFrame": "",
	// "WeaponRollParam.InkRecoverStop": "",
	// "WeaponRollParam.SpeedDash": "",
	// "WeaponRollParam.SpeedDashTurnBreak": "",
	// "WeaponRollParam.SpeedInkConsumeMax": "",
	// "WeaponRollParam.SpeedInkConsumeMin": "",
	// "WeaponRollParam.SpeedNormal": "",
	"WeaponRollParam.SwingRepeatFrame":
		"Interval in frames (60 = 1 second) between continuous swings. Lower means you can swing again sooner.",
	// "WeaponRollParam.ToPaintFrame": "",

	// WeaponScopeParam
	// "WeaponScopeParam.CameraFovy": "",

	// WeaponSwingParam
	"WeaponSwingParam.InkConsume":
		"Ink used by one brush swing, as a fraction of the ink tank.",
	"WeaponSwingParam.InkRecoverStop":
		'Frames (60 = 1 second) after swinging before the ink tank starts refilling ("white ink"). Higher means a longer wait before ink recovery begins.',
	// "WeaponSwingParam.SubWeaponSquidDelayFrm": "",
	// "WeaponSwingParam.SwingFrame": "",
	// "WeaponSwingParam.SwingMoveSpeed": "",

	// WeaponVerticalSwingParam
	"WeaponVerticalSwingParam.InkConsume":
		"Ink used by one vertical swing, as a fraction of the ink tank.",
	// "WeaponVerticalSwingParam.InkConsumeRateDepletion": "",
	"WeaponVerticalSwingParam.InkRecoverStop":
		'Frames (60 = 1 second) after vertically swinging before the ink tank starts refilling ("white ink"). Higher means a longer wait before ink recovery begins.',
	// "WeaponVerticalSwingParam.SwingFrame": "",
	// "WeaponVerticalSwingParam.SwingMoveSpeed": "",

	// WeaponWideSwingParam
	"WeaponWideSwingParam.InkConsume":
		"Ink used by one wide horizontal swing, as a fraction of the ink tank.",
	// "WeaponWideSwingParam.InkConsumeRateDepletion": "",
	"WeaponWideSwingParam.InkRecoverStop":
		'Frames (60 = 1 second) after horizontally swinging before the ink tank starts refilling ("white ink"). Higher means a longer wait before ink recovery begins.',
	// "WeaponWideSwingParam.SubWeaponSquidDelayFrm": "",
	// "WeaponWideSwingParam.SwingFrame": "",
	// "WeaponWideSwingParam.SwingMoveSpeed": "",
};

/**
 * Returns a plain-English description of what a weapon parameter controls, or
 * `undefined` if no explanation has been recorded for it yet.
 *
 * This is the single source of explanation text, so the underlying store can later be
 * swapped for a translated source without changing call sites.
 */
export function getParamExplanation(
	category: string,
	key: string,
): string | undefined {
	return PARAM_EXPLANATIONS[`${category}.${key}`];
}
