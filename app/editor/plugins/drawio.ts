import { Plugin } from "prosemirror-state";
import DrawioDialog from "~/components/DrawioDialog";
import DrawioComponent from "~/components/DrawioComponent";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { light as defaultTheme } from "@shared/styles/theme";

interface DrawioDialogProps {
    isOpen: boolean;
    onClose: () => void;
    initialXml?: string;
    onSubmit: (res: { xml: string; imageUrl: string; filename: string; xmlFilename: string }) => void;
    initialFilename?: string;
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
    let editorView: any = null;
    let isDialogOpen = false;
    let isInitialized = false;

    const renderDialog = (props: DrawioDialogProps & { initialFilename?: string }) => {
        if (!dialogContainer) {
            dialogContainer = document.createElement('div');
            document.body.appendChild(dialogContainer);
        }
        ReactDOM.render(React.createElement(DrawioDialogPortal, props), dialogContainer);
    };

    const handleNewDiagram = (event: Event) => {
        console.log("[Drawio] handleNewDiagram called");
        // Get the editor view from the window object
        if (window.editor?.view) {
            editorView = window.editor.view;
            isInitialized = true;
        }
        // Check if we're properly initialized
        if (!isInitialized) {
            console.error("[Drawio] Plugin not properly initialized");
            return;
        }
        if (!editorView) {
            console.error("[Drawio] Editor view not initialized");
            return;
        }
        if (isDialogOpen) {
            console.log("[Drawio] Dialog already open");
            return;
        }
        console.log("[Drawio] Creating new dialog");
        isDialogOpen = true;
        renderDialog({
            isOpen: true,
            initialFilename: "diagram.png",
            onClose: () => {
                console.log("[Drawio] Dialog closed");
                isDialogOpen = false;
                if (dialogContainer) {
                    ReactDOM.unmountComponentAtNode(dialogContainer);
                    document.body.removeChild(dialogContainer);
                    dialogContainer = null;
                }
            },
            onSubmit: ({ xml, imageUrl, filename, xmlFilename }: { xml: string; imageUrl: string; filename: string; xmlFilename: string }) => {
                console.log("[Drawio] Dialog submitted", { xml: xml?.substring(0, 50) + "...", imageUrl, filename, xmlFilename });
                if (!editorView) {
                    console.error("[Drawio] Editor view not available");
                    return;
                }
                try {
                    const { state, dispatch } = editorView;
                    const { tr } = state;
                    const node = state.schema.nodes.drawio.create({ xml, imageUrl, filename, xmlFilename });
                    // If there's a selection, replace it. Otherwise, insert at cursor position
                    if (!state.selection.empty) {
                        tr.replaceSelectionWith(node);
                    } else {
                        const pos = state.selection.from;
                        tr.insert(pos, node);
                    }
                    dispatch(tr);
                } catch (error) {
                    console.error("[Drawio] Error inserting diagram:", error);
                }
            },
        });
    };

    const handleEditDiagram = async (event: CustomEvent) => {
        const { pos, xml, xmlFilename: eventXmlFilename } = event.detail;
        console.log("[Drawio] handleEditDiagram called", { pos, xml, eventXmlFilename });
        if (!isDialogOpen) {
            isDialogOpen = true;
            // Get the current filename and xmlFilename from the node at pos
            let filename = "diagram.png";
            let xmlFilename = eventXmlFilename || "";
            if (editorView && typeof pos === 'number') {
                const node = editorView.state.doc.nodeAt(pos);
                if (node && node.attrs) {
                    if (node.attrs.filename) filename = node.attrs.filename;
                    if (!xmlFilename && node.attrs.xmlFilename) xmlFilename = node.attrs.xmlFilename;
                }
            }
            console.log("[Drawio] Using xmlFilename for edit:", xmlFilename);
            let loadedXml = xml;
            if (xmlFilename) {
                try {
                    console.log("[Drawio] Fetching XML from attachment URL:", xmlFilename);
                    const response = await fetch(xmlFilename);
                    console.log("[Drawio] Fetch response status:", response.status, response.statusText);
                    if (!response.ok) {
                        console.error("[Drawio] Fetch failed with status:", response.status, response.statusText);
                    }
                    const text = await response.text();
                    console.log("[Drawio] Loaded XML from attachment (first 200 chars):", text.substring(0, 200));
                    console.log("[Drawio] Loaded XML length:", text.length);
                    loadedXml = text;
                } catch (err) {
                    console.error("[Drawio] Failed to fetch XML from attachment:", err);
                }
            }
            renderDialog({
                isOpen: true,
                initialXml: loadedXml,
                initialFilename: filename,
                onClose: () => {
                    isDialogOpen = false;
                    if (dialogContainer) {
                        ReactDOM.unmountComponentAtNode(dialogContainer);
                        document.body.removeChild(dialogContainer);
                        dialogContainer = null;
                    }
                },
                onSubmit: ({ xml, imageUrl, filename, xmlFilename }: { xml: string; imageUrl: string; filename: string; xmlFilename: string }) => {
                    if (!editorView) {
                        console.error("[Drawio] Editor view not available");
                        return;
                    }
                    try {
                        const { state, dispatch } = editorView;
                        const { tr } = state;
                        tr.setNodeMarkup(pos, undefined, { xml, imageUrl, filename, xmlFilename });
                        dispatch(tr);
                    } catch (error) {
                        console.error("[Drawio] Error updating diagram:", error);
                    }
                },
            });
        }
    };

    // Initialize event listeners
    const initializeEventListeners = () => {
        console.log("[Drawio] Initializing event listeners");
        window.addEventListener("outline:drawio:new", handleNewDiagram);
        window.addEventListener("outline:drawio:edit", handleEditDiagram as EventListener);
    };

    // Clean up event listeners
    const cleanupEventListeners = () => {
        console.log("[Drawio] Cleaning up event listeners");
        window.removeEventListener("outline:drawio:new", handleNewDiagram);
        window.removeEventListener("outline:drawio:edit", handleEditDiagram as EventListener);
    };

    // Initialize event listeners immediately
    initializeEventListeners();

    return new Plugin({
        view: (view) => {
            console.log("[Drawio] Plugin view initialized");
            editorView = view;
            isInitialized = true;
            return {
                destroy: () => {
                    console.log("[Drawio] Plugin view destroyed");
                    editorView = null;
                    isInitialized = false;
                    cleanupEventListeners();
                }
            };
        },
        props: {
            nodeViews: {
                drawio: (node, view, getPos) => {
                    const isDark = window.document.documentElement.getAttribute('data-theme') === 'dark';
                    const container = document.createElement('div');
                    container.className = "drawio-node-container";
                    console.log("[Drawio] Rendering nodeView for drawio", { node, pos: getPos() });
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