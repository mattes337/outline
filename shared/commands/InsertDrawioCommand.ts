import { Command } from "./types";

const InsertDrawioCommand: Command = {
    name: "drawio",
    title: "Insert Draw.IO Diagram",
    keywords: "diagram,drawio,draw,flowchart",
    icon: "DiagramIcon",
    visible: true,
    shortcut: "",
    execute: (_state, _dispatch, _view) => {
        window.dispatchEvent(new CustomEvent("outline:drawio:new"));
    },
};

export default InsertDrawioCommand; 