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
                filename: { default: "New Diagram" },
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
                        filename: dom.getAttribute("filename") || "New Diagram",
                    }),
                },
            ],
            toDOM: (node) => {
                console.log("[Drawio] toDOM called with filename:", node.attrs.filename);
                return [
                    "drawio-diagram",
                    {
                        class: "drawio-diagram",
                        xml: node.attrs.xml,
                        imageUrl: node.attrs.imageUrl,
                        filename: node.attrs.filename,
                    },
                ];
            },
        };
    }

    toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
        console.log("[Drawio] Serializing to markdown with filename:", node.attrs.filename);
        state.write(`![${node.attrs.filename || "New Diagram"}](${node.attrs.imageUrl})`);
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