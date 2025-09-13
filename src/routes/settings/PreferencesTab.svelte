<script lang="ts">
	import * as SettingsAPI from '$lib/api/settings';
	import SwitchFormField from '$lib/components/form/SwitchFormField.svelte';
	import SelectFormField from '$lib/components/form/SelectFormField.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Theme } from '$lib/api/settings/schemas';

	const preferences = await SettingsAPI.queries.byLoggedInUser(); // xxx: spinner
	const theme = await SettingsAPI.queries.myTheme();

	async function updatePreferences(
		args: Parameters<typeof SettingsAPI.actions.updateBooleanPreferences>[0]
	) {
		await SettingsAPI.actions.updateBooleanPreferences(args).updates(
			SettingsAPI.queries.byLoggedInUser().withOverride((preferences) => ({
				...preferences,
				...args
			}))
		);
	}
</script>

<div class="stack lg">
	<!-- xxx: language -->

	<SelectFormField
		name="theme"
		label={m.common_header_theme()}
		items={[
			{ value: 'auto', label: m.common_theme_auto() },
			{ value: 'dark', label: m.common_theme_dark() },
			{ value: 'light', label: m.common_theme_light() }
		]}
		value={theme}
		onSelect={async (theme) => {
			await SettingsAPI.actions.setTheme({ theme: theme as Theme });
			document.documentElement.className = theme;
		}}
	/>

	<!-- xxx: push notifs -->

	<SwitchFormField
		name="disableBuildAbilitySorting"
		label={m.common_settings_UPDATE_DISABLE_BUILD_ABILITY_SORTING_label()}
		bottomText={m.common_settings_UPDATE_DISABLE_BUILD_ABILITY_SORTING_bottomText()}
		bind:checked={
			() => preferences?.disableBuildAbilitySorting ?? false,
			async (value) => await updatePreferences({ disableBuildAbilitySorting: value })
		}
	/>

	<SwitchFormField
		name="disallowScrimPickupsFromUntrusted"
		label={m.common_settings_DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED_label()}
		bottomText={m.common_settings_DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED_bottomText()}
		bind:checked={
			() => preferences?.disallowScrimPickupsFromUntrusted ?? false,
			async (value) => await updatePreferences({ disallowScrimPickupsFromUntrusted: value })
		}
	/>

	<!-- xxx: sounds -->
</div>
