<script setup lang="ts">
	import { onBeforeMount, ref } from "vue";
	import BasePost from "./BasePost.vue";
	import { api_call, create_lcg_random, format_date, today } from "@/Lib";

	interface Door {
		value: number;
		date: string;
		enabled: boolean;
	}
	const active_day = ref<Door>();
	const doors = ref<Door[]>();

	onBeforeMount(async () => {
		const response = await api_call<{ start: string; days: number }>("GET", "posts/config");

		if (response.ok) {
			const days = Array.from(Array(response.data.days).keys());

			// shuffle the elements
			const lcg_random = create_lcg_random(17);
			for (var i = days.length - 1; i >= 0; i--) {
				var j = Math.floor(lcg_random() * (i + 1));
				var temp = days[i];
				days[i] = days[j];
				days[j] = temp;
			}

			const start_date = new Date(response.data.start);

			doors.value = days.map((day) => {
				const this_date = new Date(start_date.valueOf());
				this_date.setDate(this_date.getDate() + day);

				return {
					value: day + 1,
					date: format_date(this_date),
					enabled: today >= this_date
				};
			});
		}
	});

	function select_door(door: Door) {
		if (active_day.value?.date !== door.date && door.enabled) {
			active_day.value = door;
		}
	}
</script>

<template>
	<div id="day_selection">
		<div
			v-for="door of doors"
			:key="door.value"
			class="door"
			:class="{ selected: door.value === active_day?.value, enabled: door.enabled }"
			@click="select_door(door)"
		>
			{{ door.value }}
		</div>
	</div>
	<BasePost v-if="active_day !== undefined" :pid="active_day.value" :key="active_day.value" />
</template>

<style scoped>
	#day_selection {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;

		gap: 0.25em;

		max-width: 20em;
		width: 100%;

		margin-inline: auto;
	}

	.door {
		display: flex;
		justify-content: center;
		align-items: center;

		aspect-ratio: 1;

		font-size: 1.333em;

		background-color: var(--color-accent);
		color: white;

		border-radius: 0.125em;

		cursor: not-allowed;

		transition: background-color 0.2s ease;
	}

	.door.enabled:hover {
		background-color: var(--color-accent-hover);
	}

	.door.selected {
		background-color: var(--color-contrast);
	}

	.door.selected:hover {
		background-color: var(--color-contrast-hover);
	}

	.door.enabled {
		cursor: pointer;
	}
</style>
