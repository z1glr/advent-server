<script setup lang="ts">
	const props = defineProps<{
		disabled?: boolean;
	}>();

	const state = defineModel<boolean>({ default: false });

	function toggle() {
		if (!props.disabled) {
			state.value = !state.value;
		}
	}
</script>

<template>
	<div
		id="wrapper"
		class="relative aspect-[2] h-5 select-none rounded-full bg-neutral-300 shadow-inner transition-colors"
		:class="{ active: state, disabled }"
		@click="toggle"
	>
		<div id="slider" class="absolute inset-0 m-[0.1875rem]"></div>
	</div>
</template>

<style scoped>
	#wrapper.disabled {
		@apply bg-neutral-400;
	}

	#wrapper.active.disabled {
		@apply bg-blue-300;
	}

	#wrapper:not(.disabled) {
		@apply cursor-pointer;
	}

	#wrapper.active {
		@apply bg-blue-700;
	}

	#wrapper:not(.disabled):hover {
		@apply bg-neutral-400;
	}
	#wrapper.active:not(.disabled):hover {
		@apply bg-blue-800;
	}

	#slider::before {
		position: absolute;

		content: "";

		aspect-ratio: 1;
		height: 100%;

		left: 0;
		top: 0;

		border-radius: 50%;

		background-color: var(--color-background);

		transition-property: margin, transform;
		transition-duration: 0.2s;
		transition-timing-function: ease;
	}

	.active > #slider::before {
		margin-left: 100%;
		transform: translatex(-100%);
	}
</style>
