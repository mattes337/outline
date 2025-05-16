import { Plugin } from "prosemirror-state";
import Drawio from "@shared/editor/extensions/Drawio";
import DrawioDialog from "@components/DrawioDialog";
import DrawioComponent from "@components/DrawioComponent";

interface DrawioDialogProps {
    isOpen: boolean;
    onClose: () => void;
    initialXml?: string;
    onSubmit: (res: { xml: string; imageUrl: string }) => void;
}

declare global {
    interface Window {
        editor: {
            view: {
                state: any;
                dispatch: any;
            };
        };
    }
}

export default function createDrawioPlugin() {
    let dialog: DrawioDialog | null = null;

    const handleNewDiagram = () => {
        console.log("[Drawio] handleNewDiagram called");
        if (!dialog) {
            console.log("[Drawio] Creating new dialog");
            dialog = new DrawioDialog({
                isOpen: true,
                onClose: () => {
                    console.log("[Drawio] Dialog closed");
                    dialog = null;
                },
                onSubmit: ({ xml, imageUrl }: { xml: string; imageUrl: string }) => {
                    console.log("[Drawio] Dialog submitted", { xml: xml?.substring(0, 50) + "...", imageUrl });
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
                onSubmit: ({ xml, imageUrl }: { xml: string; imageUrl: string }) => {
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