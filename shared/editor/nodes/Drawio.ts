import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import Node from "./Node";
import { Command } from "prosemirror-state";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ParseSpec } from "prosemirror-markdown";

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
                "div",
                {
                    class: "drawio-diagram",
                },
                [
                    "img",
                    {
                        src: node.attrs.imageUrl,
                        alt: "Draw.io Diagram",
                        class: "drawio-diagram",
                    },
                ],
            ],
        };
    }

    toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
        state.write(`![diagram](${node.attrs.imageUrl})`);
        state.ensureNewLine();
        state.write("```drawio");
        state.ensureNewLine();
        state.text(node.attrs.xml, false);
        state.ensureNewLine();
        state.write("```");
        state.closeBlock(node);
    }

    parseMarkdown(): ParseSpec {
        return {
            block: "drawio",
            getAttrs: (tok: { info: string; content: string }) => {
                if (tok.info === "drawio") {
                    return { xml: tok.content.trim() };
                }
                return null;
            },
        };
    }

    commands({ type }: { type: NodeType }) {
        return {
            drawio: (): Command => (state, dispatch, view) => {
                console.log("[Drawio] Command triggered");
                if (!view) {
                    console.error("[Drawio] No editor view available");
                    return false;
                }

                window.editor = { view };

                const event = new CustomEvent("outline:drawio:new");
                window.dispatchEvent(event);

                return true;
            },
        };
    }
} 