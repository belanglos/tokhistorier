import "./style.css";
import { mountStory } from "./story1";

const app = document.getElementById("app");
if (app) mountStory(app);
