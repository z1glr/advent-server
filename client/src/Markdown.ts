import "./assets/main.css";

import { createApp } from "vue";

import App from "./BaseMarkdown.vue";

const app = createApp(App);

const content_param = document.location.pathname + ".md";
app.provide("content", content_param);

app.mount("#app_mount");
