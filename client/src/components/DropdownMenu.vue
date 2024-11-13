<script setup lang="ts">
	import { ref, onMounted, onUnmounted } from "vue";

	// const props = defineProps<{

	// }>();

	// const emit = defineEmits<{

	// }>();

	const dropped = ref<boolean>(false);

	// catch clicks anywhere to close
	onMounted(() => {
		addEventListener("click", on_click_event);
		addEventListener("contextmenu", on_click_event);
	});

	onUnmounted(() => {
		removeEventListener("click", on_click_event);
		removeEventListener("contextmenu", on_click_event);
	});

	function on_click_event(event: MouseEvent) {
		dropped.value = false;

		event.stopPropagation();
		event.preventDefault();
	}
</script>

<template>
	<div id="wrapper">
		<div @click.stop="dropped = !dropped">
			<slot />
		</div>
		<div v-show="dropped" id="dropdown">
			<slot name="dropdown"> </slot>
		</div>
	</div>
</template>

<style scoped>
	#wrapper {
		position: relative;
		display: inline-block;
	}

	#dropdown {
		position: absolute;

		display: flex;
		flex-direction: column;
		padding: 0.25em;
		gap: 0.25em;
		left: -0.25em;

		border-radius: 0.25em;

		background-color: var(--color-background);
		box-shadow: 0 0.25rem 0.5rem 0 rgba(0, 0, 0, 0.2);
		z-index: 1;
	}
</style>
