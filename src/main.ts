import "./theme.css";
import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { initPwa } from "./lib/pwa";

initPwa();

export default mount(App, { target: document.getElementById("app")! });
