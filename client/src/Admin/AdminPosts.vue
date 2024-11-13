<script setup lang="ts">
	import { onMounted, onUnmounted, ref, watch } from "vue";
	import { MdEditor } from "md-editor-v3";
	import "md-editor-v3/lib/style.css";
	import VueMarkdown from "vue-markdown-render";

	import { api_call, HTTPStatus } from "@/Lib";
	import { type Post } from "@/Global";

	const posts = ref<Post[]>([]);
	const selected_post = ref<Post>();

	const unsaved_changes = ref<boolean>(false);
	const dark_mode = ref<boolean>(
		window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
	);

	onMounted(async () => {
		addEventListener("beforeunload", on_leave_page);
		window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", on_theme_change);

		await get_posts();
		unsaved_changes.value = false;
	});

	onUnmounted(() => {
		removeEventListener("beforeunload", on_leave_page);
		window
			.matchMedia("(prefers-color-scheme: dark)")
			.removeEventListener("change", on_theme_change);
	});

	watch(posts, (posts) => {
		selected_post.value = posts[0];
	});

	// watch for change of the selccted post -> reset unsaved_changes
	watch(
		selected_post,
		(new_post, old_post) => {
			// if the id changed, it is a new post -> reset
			unsaved_changes.value = old_post?.pid === new_post?.pid;
		},
		{ deep: true }
	);

	function on_theme_change() {
		dark_mode.value =
			window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
	}

	function on_leave_page(event: BeforeUnloadEvent) {
		if (unsaved_changes.value) {
			event.preventDefault();
		}
	}

	async function get_posts() {
		const response = await api_call<Post[]>("GET", "posts");

		if (response.ok) {
			posts.value = response.data;
		}
	}
	async function save_post() {
		if (selected_post.value !== undefined) {
			const response = await api_call(
				"PATCH",
				"posts",
				{ pid: selected_post.value.pid },
				{
					content: selected_post.value.content
				}
			);

			if (response.ok) {
				unsaved_changes.value = false;
			}
		}
	}

	async function upload_image(
		files: File[],
		callback: (urls: string[] | { url: string; alt: string; title: string }[]) => void
	) {
		const form_data = new FormData();
		form_data.append("file", files[0]);

		const response = await fetch(window.origin + "/api/storage/upload", {
			method: "POST",
			credentials: "include",
			body: form_data
		});

		// if the error-code is 401 = unauthorized, go back to the login-view
		if (response.status === HTTPStatus.Unauthorized) {
			location.reload();
		}

		const content_type = response.headers.get("content-type");

		if (content_type && content_type.indexOf("application/json") !== -1) {
			const res = (await response.json()) as { url: string };

			callback([res.url]);
		}
	}
</script>

<template>
	<h1>Posts</h1>
	<span
		id="post-selector"
		:data-tooltip="unsaved_changes ? 'There are unsaved changes' : undefined"
	>
		Select Post:
		<select id="post-select" v-model="selected_post" :class="{ disabled: unsaved_changes }">
			<option v-for="post in posts" :key="post.pid" :value="post">
				{{ post.date }}
			</option>
		</select>
	</span>
	<div id="content_wrapper">
		<div id="content" v-if="!!selected_post">
			<MdEditor
				id="editor"
				v-model="selected_post.content"
				language="en-US"
				:toolbars="[
					'revoke',
					'next',
					'save',
					'-',
					'title',
					'bold',
					'italic',
					'underline',
					'strikeThrough',
					'orderedList',
					'unorderedList',
					'link',
					'table',
					'quote',
					'image'
				]"
				:theme="dark_mode ? 'dark' : 'light'"
				:tab-width="4"
				:preview="false"
				@on-save="save_post"
				@on-upload-img="upload_image"
			/>
			<VueMarkdown id="preview" :source="selected_post.content" />
		</div>
	</div>
</template>

<style scoped>
	#post-selector {
		display: inline-flex;
		gap: 0.25em;
	}

	#post-select {
		font-size: 1em;

		border-radius: 0.125em;

		background-color: var(--color-contrast);

		border: unset;

		color: var(--color-background);
	}

	#post-select:focus {
		outline: unset;
	}

	#post-select > option {
		color: var(--color-text);
		background-color: var(--color-background);
	}

	#post-select.disabled {
		color: var(--color-text-disabled);

		cursor: help;
	}

	[data-tooltip] {
		position: relative;
		cursor: help;
	}

	[data-tooltip]::after {
		content: attr(data-tooltip);

		position: absolute;
		left: 0;
		top: calc(100% + 0.25em);

		opacity: 0;

		font-size: 0.67em;

		max-width: 16em;
		width: max-content;

		pointer-events: none;
		border-radius: 0.125em;
		box-shadow: 0 0.25rem 0.5rem 0 rgba(0, 0, 0, 0.2);
		background-color: var(--color-background);
		z-index: 10;
		padding: 0.5em;
		transform: translateY(-1em);
		transition: all 150ms cubic-bezier(0.25, 0.8, 0.25, 1);
	}

	[data-tooltip]:hover::after {
		opacity: 1;
		transform: translateY(0);
		transition-duration: 300ms;
	}

	#content_wrapper {
		width: 100%;

		display: flex;
		flex-direction: column;
		gap: 0.25em;

		flex: 1;

		overflow: clip;
	}

	#content {
		display: flex;
		flex: 1;

		position: relative;
	}

	#content > * {
		position: absolute;

		top: 0;
		bottom: 0;

		height: unset;
		width: unset;
	}

	#editor {
		left: 0;
		right: 50%;
	}

	#preview {
		left: 50%;
		right: 0;

		display: block;

		padding: 1em;

		overflow-y: scroll;
		overflow-x: hidden;

		font-size: 0.75em;
	}

	#preview:deep(code) {
		text-wrap: wrap;
		overflow-wrap: anywhere;
	}
</style>

<style>
	.md-editor {
		--md-bk-color: var(--color-background) !important;
		--md-color: var(--color-text) !important;
		--md-scrollbar-bg-color: unset;
		--md-scrollbar-thumb-color: var(--color-text);
		--md-scrollbar-thumb-hover-color: var(--color-text-hover);
		--md-scrollbar-thumb-active-color: var(--color-on);
	}
</style>
