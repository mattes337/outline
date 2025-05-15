import { Plugin } from "prosemirror-state";
import { drawio } from "@shared/editor/extensions/Drawio";
import DrawioDialog from "@components/DrawioDialog";
import DrawioComponent from "@components/DrawioComponent";

export default function createDrawioPlugin() {
    let dialog: DrawioDialog | null = null;

    const handleNewDiagram = () => {
        if (!dialog) {
            dialog = new DrawioDialog({
                isOpen: true,
                onClose: () => {
                    dialog = null;
                },
                onSubmit: ({ xml, imageUrl }) => {
                    const { state, dispatch } = window.editor.view;
                    const { tr } = state;
                    const node = state.schema.nodes.drawio.create({ xml, imageUrl });
                    tr.replaceSelectionWith(node);
                    dispatch(tr);
                },
            });
        }
    };

    const handleEditDiagram = (event: CustomEvent) => {
        const { pos, xml } = event.detail;
        if (!dialog) {
            dialog = new DrawioDialog({
                isOpen: true,
                initialXml: xml,
                onClose: () => {
                    dialog = null;
                },
                onSubmit: ({ xml, imageUrl }) => {
                    const { state, dispatch } = window.editor.view;
                    const { tr } = state;
                    tr.setNodeMarkup(pos, undefined, { xml, imageUrl });
                    dispatch(tr);
                },
            });
        }
    };

    window.addEventListener("outline:drawio:new", handleNewDiagram);
    window.addEventListener("outline:drawio:edit", handleEditDiagram as EventListener);

    return new Plugin({
        props: {
            nodeViews: {
                drawio: (node, view, getPos) => {
                    return new DrawioComponent({ node, view, getPos });
                },
            },
        },
    });
} 