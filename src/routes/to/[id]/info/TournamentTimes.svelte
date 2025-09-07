<script lang="ts">
	import * as TournamentAPI from '$lib/api/tournament';
	import { getLocale } from '$lib/paraglide/runtime';
	import { getMinutes } from 'date-fns';
	import Clock from '@lucide/svelte/icons/clock';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		times: TournamentAPI.queries.InfoByIdData['times'];
	}

	let { times }: Props = $props();

	function formatDate(date: Date) {
		return date.toLocaleString(getLocale(), {
			weekday: 'short',
			day: 'numeric',
			month: 'numeric',
			year: '2-digit',
			hour: 'numeric',
			minute: getMinutes(date) === 0 ? undefined : 'numeric'
		});
	}
</script>

<!-- xxx: add discord copy popover -->
<!-- xxx: sort so chronological? -->
<div class="times-container">
	<h2>
		<div class="time-line"></div>
		<Clock />{m.equal_smart_moose_kick()}
		<div class="time-line"></div>
	</h2>
	<div class="times">
		<dt>{m.knotty_tough_parrot_lead()}</dt>
		<div class="line"></div>
		{@render timeButton(times.registrationEndsAt)}

		<dt>{m.sunny_tired_insect_dust()}</dt>
		<div class="line"></div>
		{@render timeButton(times.checkinStartsAt)}

		<dt>{m.civil_clear_canary_renew()}</dt>
		<div class="line"></div>
		{@render timeButton(times.startsAt)}

		{#if times.dayTwoStartsAt}
			<dt>{m.super_bald_poodle_hunt()}</dt>
			<div class="line"></div>
			{@render timeButton(times.dayTwoStartsAt)}
		{/if}
	</div>
</div>

{#snippet timeButton(date: Date)}
	<dd>{formatDate(date)}</dd>
{/snippet}

<style>
	.times-container {
		container-type: inline-size;

		& h2 {
			font-size: var(--fonts-sm);
			margin-block-end: var(--s-1);
			justify-content: center;
			align-items: center;
			display: flex;
			gap: var(--s-1-5);
		}

		& :global(svg) {
			width: 1rem;
			height: 1rem;
		}
	}

	.times {
		display: grid;
		grid-template-columns: max-content 1fr max-content;
		background-color: var(--color-base-card);
		border-radius: var(--radius-box);
		padding: var(--s-2) var(--s-4);
		align-items: center;
		column-gap: var(--s-4);

		@container (width < 450px) {
			grid-template-columns: 1fr;
			place-items: center;
		}
	}

	.time-line {
		height: 4px;
		background-color: var(--color-base-card);
		flex-grow: 1;
		margin-inline: var(--s-2);
	}

	.line {
		height: 2px;
		background-color: var(--color-primary-transparent);
		border-radius: 2px;
		width: 100%;

		@container (width < 450px) {
			display: none;
		}
	}

	dt {
		font-style: italic;
	}

	dd {
		font-weight: var(--semi-bold);

		&:not(:last-of-type) {
			@container (width < 450px) {
				margin-block-end: var(--s-4);
			}
		}
	}
</style>
