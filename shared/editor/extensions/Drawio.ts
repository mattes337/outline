import { NodeSpec, NodeType } from "prosemirror-model";
import Node from "../nodes/Node";
import { Command } from "prosemirror-state";

export default class Drawio extends Node {
    get name() {
        return "drawio";
    }

    get schema(): NodeSpec {
        return {
            attrs: {
                xml: { default: "" },
                imageUrl: { default: "" },
            },
            group: "block",
            draggable: false,
            atom: true,
            selectable: true,
            parseDOM: [
                {
                    tag: "drawio-diagram",
                    getAttrs: (dom: HTMLElement) => ({
                        xml: dom.getAttribute("xml") || "",
                        imageUrl: dom.getAttribute("imageUrl") || "",
                    }),
                },
            ],
            toDOM: (node) => [
                "drawio-diagram",
                {
                    xml: node.attrs.xml,
                    imageUrl: node.attrs.imageUrl,
                    class: "drawio-diagram",
                },
            ],
        };
    }

    commands({ type }: { type: NodeType }) {
        return {
            drawio: (): Command => (state, dispatch) => {
                window.dispatchEvent(new CustomEvent("outline:drawio:new"));
                return true;
            },
        };
    }
} 