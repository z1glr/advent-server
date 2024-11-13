<script setup lang="ts">
	import { ref, watch } from "vue";
	import VueMarkdown from "vue-markdown-render";

	const props = defineProps<{
		url: string;
	}>();

	const markdown = ref<string>("");

	watch(
		() => props.url,
		async () => {
			const response = await fetch(props.url, {
				method: "GET"
			});

			if (response.ok) {
				markdown.value = await response.text();
			}
		},
		{ immediate: true }
	);
</script>

<template>
	<VueMarkdown id="content" :source="markdown" />
</template>

<style scoped>
	#content {
	}
</style>
