<script setup lang="ts">
	import { onMounted, ref } from "vue";
	import VueMarkdown from "vue-markdown-render";

	import { api_call } from "@/Lib";
	import { type Comment, type Post } from "@/Global";
	import BaseComment from "@/components/Post/BaseComment.vue";
	import BaseSlider from "@/components/BaseSlider.vue";

	const show_only_unanswered = ref<boolean>(true);
	const posts = ref<Post[]>([]);
	const comments = ref<Comment[]>([]);

	onMounted(async () => {
		await get_posts();
		await get_comments();
	});

	async function get_posts() {
		const response = await api_call<Post[]>("GET", "posts");

		if (response.ok) {
			posts.value = response.data.reverse();
		}
	}

	async function get_comments() {
		const response = await api_call<Comment[]>("GET", "comments");

		if (response.ok) {
			comments.value = response.data;
		}
	}

	function show_comment(comment: Comment, post: Post): boolean {
		return (
			comment.pid === post.pid &&
			(!show_only_unanswered.value || comment.answer === undefined || comment.answer === "")
		);
	}
</script>

<template>
	<h1>Comments</h1>
	<div id="control">
		<BaseSlider v-model="show_only_unanswered" />
		Show only comments without answer
	</div>
	<template v-for="post in posts" :key="post.pid">
		<div v-if="comments.some((comment) => show_comment(comment, post))" class="post">
			<VueMarkdown class="post_teaser" :source="post.content" />
			<template v-for="(comment, i_comment) of comments" :key="comment.cid">
				<BaseComment
					v-if="show_comment(comment, post)"
					:comment="comment"
					:pid="comment.pid"
					@answer="(comment) => (comments[i_comment] = comment)"
					@delete="get_comments()"
				/>
			</template>
		</div>
	</template>
</template>

<style scoped>
	#control {
		display: flex;
		gap: 0.25em;
	}

	.post {
		width: auto;

		display: flex;
		flex-direction: column;
		gap: 0.25em;
	}

	.post_teaser {
		max-height: 5em;
		overflow-y: clip;
	}

	.post_teaser > :nth-child(n + 2) {
		display: none;
	}

	.post_teaser:deep(*) {
		margin-block: 0;
	}

	.post_teaser:deep(code) {
		text-wrap: wrap;
		overflow-wrap: anywhere;
	}
</style>
