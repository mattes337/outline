import { NodeSpec, Node as ProsemirrorNode } from "prosemirror-model";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ParseSpec } from "prosemirror-markdown";
import Node from "./Node";

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

    toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
        state.write(`![diagram](${node.attrs.imageUrl})`);
        state.ensureNewLine();
        state.write("```drawio");
        state.ensureNewLine();
        state.text(node.attrs.xml);
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
} 