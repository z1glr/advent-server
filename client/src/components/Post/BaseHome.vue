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
	<div class="mx-auto grid w-full max-w-80 grid-cols-6 gap-1">
		<div
			v-for="door of doors"
			:key="door.value"
			class="door flex aspect-square cursor-not-allowed items-center justify-center rounded-sm bg-red-600 text-xl text-white transition-colors"
			:class="{
				'bg-teal-600 hover:bg-teal-700': door.value === active_day?.value,
				'cursor-pointer hover:bg-red-700': door.enabled
			}"
			@click="select_door(door)"
		>
			{{ door.value }}
		</div>
	</div>
	<BasePost v-if="active_day !== undefined" :pid="active_day.value" :key="active_day.value" />
</template>

<style scoped></style>
