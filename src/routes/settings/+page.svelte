<script lang="ts">
	import Main from '$lib/components/layout/Main.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';
	import Tabs from '$lib/components/tabs/Tabs.svelte';
	import Flame from '@lucide/svelte/icons/flame';
	import ChartNoAxesColumnDecreasing from '@lucide/svelte/icons/chart-no-axes-column-decreasing';

	let value = $state('test');
</script>

<Main>
	<Tabs
		bind:value
		triggers={[
			{ label: 'Test', value: 'test', icon: Flame, number: 4 },
			{ label: 'Test 2', value: 'test-2', icon: ChartNoAxesColumnDecreasing }
		]}
	>
		<TabPanel value="test">Test</TabPanel>
		<TabPanel value="test-2">Test 2</TabPanel>
	</Tabs>
</Main>
