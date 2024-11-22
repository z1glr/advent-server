<script setup lang="ts">
	import { onMounted, ref } from "vue";
	import VueMarkdown from "vue-markdown-render";
	import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
	import { faPaperPlane } from "@fortawesome/free-regular-svg-icons";

	import BaseComment from "./BaseComment.vue";
	import BaseButton from "../BaseButton.vue";

	import Global, { type Comment, type Post } from "@/Global";
	import { api_call, format_date, today } from "@/Lib";

	const props = defineProps<{
		pid: number;
	}>();

	const content = ref<Post>();
	const comments = ref<Comment[]>([]);
	const comment_input_text = ref<string>("");

	onMounted(async () => {
		await Promise.allSettled([get_post(), get_comments()]);
	});

	async function get_post() {
		const response = await api_call<Post>("GET", "posts", { pid: props.pid });

		if (response.ok) {
			content.value = response.data;
		}
	}

	async function get_comments() {
		const response = await api_call<Comment[]>("GET", "comments", { pid: props.pid });

		if (response.ok) {
			comments.value = response.data;
		}
	}

	async function send_comment() {
		if (comment_input_text.value.length > 0 && !!content.value) {
			const response = await api_call<Comment[]>(
				"POST",
				"comments",
				{ pid: content.value.pid },
				{
					text: comment_input_text.value
				}
			);

			if (response.ok) {
				comments.value = response.data;

				comment_input_text.value = "";
			}
		}
	}
</script>

<template>
	<template v-if="content !== undefined">
		<VueMarkdown
			id="content"
			class="w-full max-w-[30rem] overflow-x-clip"
			:source="content.content"
		/>
		<template v-if="comments.length > 0 || content.date === format_date(today)">
			<h2 class="text-3xl">Fragen</h2>
			<div
				class="flex w-full max-w-[30rem] items-center gap-1"
				v-show="
					!comments.some((comment) => comment.uid === Global.user.value?.uid) &&
					content.date === format_date(today)
				"
			>
				<textarea
					class="min-h-16 w-full resize-y"
					v-model="comment_input_text"
					placeholder="Frage einsenden"
				/>
				<BaseButton id="send-button" @click="send_comment"
					><FontAwesomeIcon :icon="faPaperPlane"
				/></BaseButton>
			</div>
			<div class="grid w-full max-w-[30rem] gap-1">
				<BaseComment
					v-for="(comment, i_comment) of comments"
					:key="comment.cid"
					:comment="comment"
					:pid="content.pid"
					@answer="(new_comment) => (comments[i_comment] = new_comment)"
					@delete="get_comments()"
				/>
			</div>
		</template>
	</template>
</template>

<style scoped>
	#content:deep(code) {
		text-wrap: wrap;
		overflow-wrap: anywhere;
	}

	#content:deep(h1) {
		@apply text-4xl font-bold;
	}

	#content:deep(h2) {
		@apply text-3xl font-bold;
	}

	#content:deep(h3) {
		@apply text-2xl font-bold;
	}

	#content:deep(h4) {
		@apply text-xl font-bold;
	}

	#content:deep(h5) {
		@apply text-lg font-bold;
	}

	#content:deep(h6) {
		@apply font-bold;
	}
</style>
