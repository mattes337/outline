import { NodeSpec } from "prosemirror-model";

export const drawio: NodeSpec = {
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