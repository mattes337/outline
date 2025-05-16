import { Plugin } from "prosemirror-state";
import Drawio from "@shared/editor/extensions/Drawio";
import DrawioDialog from "@components/DrawioDialog";
import DrawioComponent from "@components/DrawioComponent";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { light as defaultTheme } from "@shared/styles/theme";

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

// Create a wrapper component that will handle the portal
const DrawioDialogPortal: React.FC<DrawioDialogProps> = (props) => {
    const [container] = React.useState(() => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        return div;
    });

    React.useEffect(() => {
        return () => {
            document.body.removeChild(container);
        };
    }, [container]);

    return ReactDOM.createPortal(
        React.createElement(DrawioDialog, props),
        container
    );
};

export default function createDrawioPlugin() {
    let dialogContainer: HTMLDivElement | null = null;

    const renderDialog = (props: DrawioDialogProps) => {
        if (!dialogContainer) {
            dialogContainer = document.createElement('div');
            document.body.appendChild(dialogContainer);
        }
        ReactDOM.render(React.createElement(DrawioDialogPortal, props), dialogContainer);
    };

    const handleNewDiagram = () => {
        console.log("[Drawio] handleNewDiagram called");
        if (!dialogContainer) {
            console.log("[Drawio] Creating new dialog");
            renderDialog({
                isOpen: true,
                onClose: () => {
                    console.log("[Drawio] Dialog closed");
                    if (dialogContainer) {
                        ReactDOM.unmountComponentAtNode(dialogContainer);
                        document.body.removeChild(dialogContainer);
                        dialogContainer = null;
                    }
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
        if (!dialogContainer) {
            renderDialog({
                isOpen: true,
                initialXml: xml,
                onClose: () => {
                    if (dialogContainer) {
                        ReactDOM.unmountComponentAtNode(dialogContainer);
                        document.body.removeChild(dialogContainer);
                        dialogContainer = null;
                    }
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
                    const isDark = window.document.documentElement.getAttribute('data-theme') === 'dark';
                    const container = document.createElement('div');
                    ReactDOM.render(
                        React.createElement(DrawioComponent, {
                            node,
                            view,
                            theme: {
                                ...defaultTheme,
                                isDark
                            },
                            isSelected: false,
                            isEditable: view.editable,
                            getPos: () => {
                                const pos = getPos();
                                if (typeof pos !== 'number') {
                                    throw new Error('Invalid position for drawio node');
                                }
                                return pos;
                            }
                        }),
                        container
                    );
                    return {
                        dom: container,
                        destroy: () => {
                            ReactDOM.unmountComponentAtNode(container);
                        }
                    };
                },
            },
        },
    });
} 