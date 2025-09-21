<script lang="ts">
	import type {
		BuildAbilitiesTupleWithUnknown,
		AbilityWithUnknown,
		MainWeaponId
	} from '$lib/constants/in-game/types';
	import type { SpecialEffectType, AnalyzedBuild, Stat } from '$lib/core/analyzer/types';
	import { asset } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import {
		SPECIAL_EFFECTS_SHORT,
		applySpecialEffects,
		lastDitchEffortIntensityToAp
	} from '$lib/core/analyzer/specialEffects';
	import { weaponTranslations } from '$lib/utils/i18n';
	import { EMPTY_BUILD } from '$lib/constants/build';
	import { MAX_LDE_INTENSITY } from '$lib/constants/analyzer';
	import { buildStats } from '$lib/core/analyzer/stats';
	import { buildToAbilityPoints } from '$lib/core/analyzer/utils';
	import { SearchParamState } from '$lib/runes/search-param-state.svelte';
	import z from 'zod';
	import Main from '$lib/components/layout/Main.svelte';
	import WeaponCombobox from '$lib/components/WeaponCombobox.svelte';
	import Tabs from '$lib/components/tabs/Tabs.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';
	import AbilityBuilder from '../../lib/components/builder/AbilityBuilder.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import Select from '$lib/components/Select.svelte';
	import StatsCategory from './StatsCategory.svelte';
	import StatsCard from './StatsCard.svelte';

	const ABILITY_SCHEMA = z.string() as z.ZodType<AbilityWithUnknown>;
	const GEAR_SLOTS_SCHEMA = z.tuple([
		ABILITY_SCHEMA,
		ABILITY_SCHEMA,
		ABILITY_SCHEMA,
		ABILITY_SCHEMA
	]);
	const BUILD_SCHEMA = z.tuple([GEAR_SLOTS_SCHEMA, GEAR_SLOTS_SCHEMA, GEAR_SLOTS_SCHEMA]);

	const EFFECTS_SCHEMA = z
		.object({
			DR: z.boolean(),
			OG: z.boolean(),
			LDE: z.number(),
			CB: z.boolean(),
			TACTICOOLER: z.boolean()
		})
		.partial();

	let tab = $state('buildA');

	const weapon = new SearchParamState({
		key: 'weapon',
		defaultValue: 0,
		schema: z.number() as z.ZodType<MainWeaponId>
	});

	const buildA = new SearchParamState({
		key: 'buildA',
		defaultValue: EMPTY_BUILD,
		schema: BUILD_SCHEMA
	});

	const buildB = new SearchParamState({
		key: 'buildB',
		defaultValue: EMPTY_BUILD,
		schema: BUILD_SCHEMA
	});

	const effectsA = new SearchParamState({
		key: 'effectsA',
		defaultValue: {},
		schema: EFFECTS_SCHEMA
	});

	const effectsB = new SearchParamState({
		key: 'effectsB',
		defaultValue: {},
		schema: EFFECTS_SCHEMA
	});

	const togglesToShow = $derived.by(() => {
		if (tab === 'buildA') {
			return buildA.state.flatMap((gearPiece) =>
				gearPiece.filter((ability) => SPECIAL_EFFECTS_SHORT.includes(ability as SpecialEffectType))
			) as SpecialEffectType[];
		} else if (tab === 'buildB') {
			return buildB.state.flatMap((gearPiece) =>
				gearPiece.filter((ability) => SPECIAL_EFFECTS_SHORT.includes(ability as SpecialEffectType))
			) as SpecialEffectType[];
		} else {
			return [];
		}
	});

	const { analyzed: analyzedA, abilityPoints: abilityPointsA } = $derived(
		analyzeBuild(buildA.state, effectsA.state)
	);
	const { analyzed: analyzedB, abilityPoints: abilityPointsB } = $derived(
		analyzeBuild(buildB.state, effectsB.state)
	);

	const context = $derived({
		mainWeaponId: weapon.state,
		abilityPointsA: abilityPointsA,
		abilityPointsB: abilityPointsB,
		effectsA: effectsA.state,
		effectsB: effectsB.state
	});

	function analyzeBuild(
		build: BuildAbilitiesTupleWithUnknown,
		effects: Record<string, boolean | number>
	) {
		const buildAbilityPoints = buildToAbilityPoints(build);
		const effectsToArray = Object.entries(effects)
			.filter(([_, value]) => value)
			.map(([key]) => key as SpecialEffectType);

		const abilityPoints = applySpecialEffects({
			abilityPoints: buildAbilityPoints,
			effects: effectsToArray,
			ldeIntensity: effectsA.state.LDE || 0
		});

		const analyzed = buildStats({
			abilityPoints,
			weaponSplId: weapon.state,
			mainOnlyAbilities: buildA.state
				.map((row) => row[0])
				.filter((ability) => ability !== 'UNKNOWN'),
			hasTacticooler: effectsA.state.TACTICOOLER || false
		});

		return { analyzed, abilityPoints };
	}

	function statKeyToTuple(key: keyof AnalyzedBuild['stats']) {
		return [analyzedA.stats[key], analyzedB.stats[key], key] as [
			Stat,
			Stat,
			keyof AnalyzedBuild['stats']
		];
	}

	// xxx: use bind for builds instead
	function syncBuildWithUrl(abilities: BuildAbilitiesTupleWithUnknown, primary: boolean) {
		if (primary) {
			buildA.update(abilities);
		} else {
			buildB.update(abilities);
		}
	}
</script>

<Main>
	<div class="container">
		<div class="left">
			<WeaponCombobox value={weapon.state} onselect={(value) => weapon.update(value)} />
			<div class="w-full">
				<Tabs
					bind:value={tab}
					triggers={[
						{
							label: m.analyzer_build1(),
							value: 'buildA'
						},
						{
							label: m.analyzer_build2(),
							value: 'buildB'
						},
						{
							label: m.analyzer_compare(),
							value: 'compare'
						}
					]}
				>
					<TabPanel value="buildA">
						<AbilityBuilder
							abilities={buildA.state}
							onchange={(abilities) => syncBuildWithUrl(abilities, true)}
						/>
					</TabPanel>
					<TabPanel value="buildB">
						<AbilityBuilder
							abilities={buildB.state}
							onchange={(abilities) => syncBuildWithUrl(abilities, false)}
						/>
					</TabPanel>
					<TabPanel value="compare">Compare</TabPanel>
				</Tabs>
			</div>
			<div class="toggles">
				<img src={asset('/img/special-weapons/15.avif')} height="40" width="40" alt="" />
				<Switch
					bind:checked={
						() =>
							(tab === 'buildA' ? effectsA.state['TACTICOOLER'] : effectsB.state['TACTICOOLER']) ||
							false,
						(checked) =>
							tab === 'buildA'
								? effectsA.update({ ...effectsA.state, TACTICOOLER: checked })
								: effectsB.update({ ...effectsB.state, TACTICOOLER: checked })
					}
					reverse
				/>
				{#if togglesToShow.includes('CB')}
					<img src={asset('/img/abilities/CB.avif')} height="40" width="40" alt="" />
					<Switch
						bind:checked={
							() => (tab === 'buildA' ? effectsA.state['CB'] : effectsB.state['CB']) || false,
							(checked) =>
								tab === 'buildA'
									? effectsA.update({ ...effectsA.state, CB: checked })
									: effectsB.update({ ...effectsB.state, CB: checked })
						}
						reverse
					/>
				{/if}
				{#if togglesToShow.includes('OG')}
					<img src={asset('/img/abilities/OG.avif')} height="40" width="40" alt="" />
					<Switch
						bind:checked={
							() => (tab === 'buildA' ? effectsA.state['OG'] : effectsB.state['OG']) || false,
							(checked) =>
								tab === 'buildA'
									? effectsA.update({ ...effectsA.state, OG: checked })
									: effectsB.update({ ...effectsB.state, OG: checked })
						}
						reverse
					/>
				{/if}
				{#if togglesToShow.includes('DR')}
					<img src={asset('/img/abilities/DR.avif')} height="40" width="40" alt="" />
					<Switch
						bind:checked={
							() => (tab === 'buildA' ? effectsA.state['DR'] : effectsB.state['DR']) || false,
							(checked) =>
								tab === 'buildA'
									? effectsA.update({ ...effectsA.state, DR: checked })
									: effectsB.update({ ...effectsB.state, DR: checked })
						}
						reverse
					/>
				{/if}
				{#if togglesToShow.includes('LDE')}
					<img src={asset('/img/abilities/LDE.avif')} alt="" height="40" width="40" />
					<Select
						bind:value={
							() => (tab === 'buildA' ? effectsA.state['LDE'] : effectsB.state['LDE']) || 0,
							(value) =>
								tab === 'buildA'
									? effectsA.update({ ...effectsA.state, LDE: value })
									: effectsB.update({ ...effectsB.state, LDE: value })
						}
						items={Array.from({ length: MAX_LDE_INTENSITY + 1 }, (_, i) => {
							return {
								label: `${((i / MAX_LDE_INTENSITY) * 100).toFixed(2).replace('.00', '')}% (+${lastDitchEffortIntensityToAp(i)} AP)`,
								value: i
							};
						})}
					/>
				{/if}
			</div>
		</div>
		<div class="stack md">
			<StatsCategory
				title={m.analyzer_stat_category_main()}
				titleContent={{
					text: weaponTranslations[context.mainWeaponId](),
					image: asset(`/img/main-weapons/${context.mainWeaponId}.avif`)
				}}
			>
				{#if analyzedA.stats.shotSpreadAir !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('shotSpreadAir')}
						title={m.analyzer_stat_jumpShotSpread()}
						suffix="°"
					/>
				{/if}
				{#if analyzedA.stats.shotSpreadGround !== undefined}
					<StatsCard
						{context}
						stat={analyzedA.stats.shotSpreadGround}
						title={m.analyzer_stat_groundShotSpread()}
						suffix="°"
					/>
				{/if}

				<!-- Squeezer -->
				{#if analyzedA.stats.shotAutofireSpreadAir !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('shotAutofireSpreadAir')}
						title={m.analyzer_stat_shotAutofireSpreadAir()}
						suffix="°"
					/>
				{/if}
				{#if analyzedA.stats.shotAutofireSpreadGround !== undefined}
					<StatsCard
						{context}
						stat={analyzedA.stats.shotAutofireSpreadGround}
						title={m.analyzer_stat_shotAutofireSpreadGround()}
						suffix="°"
					/>
				{/if}
				<!--  -->

				{#if analyzedA.stats.mainWeaponWhiteInkSeconds !== undefined}
					<StatsCard
						{context}
						stat={analyzedA.stats.mainWeaponWhiteInkSeconds}
						title={m.analyzer_stat_whiteInk()}
						suffix={m.analyzer_suffix_seconds()}
					/>
				{/if}
				{#if analyzedA.weapon.brellaCanopyHp !== undefined}
					<StatsCard
						{context}
						stat={analyzedA.weapon.brellaCanopyHp}
						title={m.analyzer_stat_canopyHp()}
						suffix={m.analyzer_suffix_hp()}
					/>
				{/if}
				{#if analyzedA.weapon.fullChargeSeconds !== undefined}
					<StatsCard
						{context}
						stat={analyzedA.weapon.fullChargeSeconds}
						title={m.analyzer_stat_fullChargeSeconds()}
						suffix={m.analyzer_suffix_seconds()}
					/>
				{/if}
				{#if analyzedA.weapon.maxChargeHoldSeconds !== undefined}
					<StatsCard
						{context}
						stat={analyzedA.weapon.maxChargeHoldSeconds}
						title={m.analyzer_stat_maxChargeHoldSeconds()}
						suffix={m.analyzer_suffix_seconds()}
					/>
				{/if}
			</StatsCategory>
			<StatsCategory
				title={m.analyzer_stat_category_sub()}
				titleContent={{
					text: '',
					image: asset(`/img/sub-weapons/${analyzedA.weapon.subWeaponSplId}.avif`)
				}}
			>
				<StatsCard
					{context}
					stat={statKeyToTuple('subWeaponInkConsumptionPercentage')}
					title={m.analyzer_stat_subWeaponInkConsumptionPercentage()}
					suffix="%"
				/>
				<StatsCard
					{context}
					stat={analyzedA.stats.subWeaponWhiteInkSeconds}
					title={m.analyzer_stat_whiteInk()}
					suffix={m.analyzer_suffix_seconds()}
				/>
				{#if analyzedA.stats.subVelocity !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('subVelocity')}
						title={m.analyzer_stat_sub_velocity()}
					/>
				{/if}
				{#if analyzedA.stats.subFirstPhaseDuration !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('subFirstPhaseDuration')}
						title={m.analyzer_stat_sub_firstPhaseDuration()}
						suffix={m.analyzer_suffix_seconds()}
					/>
				{/if}
				{#if analyzedA.stats.subSecondPhaseDuration !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('subSecondPhaseDuration')}
						title={m.analyzer_stat_sub_secondPhaseDuration()}
						suffix={m.analyzer_suffix_seconds()}
					/>
				{/if}
				{#if analyzedA.stats.subMarkingTimeInSeconds !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('subMarkingTimeInSeconds')}
						title={m.analyzer_stat_sub_markingTimeInSeconds()}
						suffix={m.analyzer_suffix_seconds()}
					/>
				{/if}
				{#if analyzedA.stats.subMarkingRadius !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('subMarkingRadius')}
						title={m.analyzer_stat_sub_markingRadius()}
					/>
				{/if}
				{#if analyzedA.stats.subExplosionRadius !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('subExplosionRadius')}
						title={m.analyzer_stat_sub_explosionRadius()}
					/>
				{/if}
				{#if analyzedA.stats.subHp !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('subHp')}
						title={m.analyzer_stat_sub_hp()}
						suffix={m.analyzer_suffix_hp()}
					/>
				{/if}
				{#if analyzedA.stats.subQsjBoost !== undefined}
					<StatsCard
						{context}
						stat={statKeyToTuple('subQsjBoost')}
						title={m.analyzer_stat_sub_qsjBoost()}
						suffix={m.analyzer_abilityPoints_short()}
					/>
				{/if}
			</StatsCategory>
		</div>
	</div>
</Main>

<style>
	.container {
		display: grid;
		gap: var(--s-8);
		grid-template-columns: 1fr 2fr;
	}

	.left {
		position: sticky;
		inset: 0;
		top: var(--layout-nav-height);
		display: flex;
		height: max-content;
		flex-direction: column;
		align-items: center;
		gap: var(--s-8);
	}

	.toggles {
		--select-width: 100%;
		display: grid;
		grid-template-columns: 40px auto;
		place-items: center start;
		gap: var(--s-2);
	}
</style>
