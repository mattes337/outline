import React, { useRef, useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { Dialog, DialogBackdrop, useDialogState } from "reakit/Dialog";
import { DrawIoEmbed } from "react-drawio";
import { uploadImage } from "@shared/utils/uploadImage";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    initialXml?: string;
    onSubmit: (res: { xml: string; imageUrl: string }) => void;
}

const dataURLtoFile = (dataurl: string, filename: string) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};

export default function DrawioDialog({
    isOpen,
    onClose,
    onSubmit,
    initialXml,
}: Props) {
    const ref = useRef<any>();
    const dialog = useDialogState({ visible: isOpen });
    const [isEditorReady, setIsEditorReady] = useState(false);
    const [editorInstance, setEditorInstance] = useState<any>(null);

    const handleExport = useCallback((data: { data: string; format: string }) => {
        console.log("[Drawio] Export data received:", data);

        // Convert PNG data URL to File
        const file = dataURLtoFile(data.data, "diagram.png");
        console.log("[Drawio] Converted to File object");

        // Upload using Outline's image upload
        console.log("[Drawio] Starting image upload");
        uploadImage(file).then(imageUrl => {
            console.log("[Drawio] Image uploaded successfully", imageUrl);
            onSubmit({
                xml: btoa(data.xml),  // base64 encode XML
                imageUrl
            });
            onClose();
        }).catch(error => {
            console.error("[Drawio] Failed to upload image:", error);
            throw new Error("Failed to upload image");
        });


    }, []);

    const handleSave = useCallback(async () => {
        try {
            console.log("[Drawio] Starting save process");

            if (!ref.current) {
                throw new Error("Draw.io editor not initialized");
            }

            // Get PNG data
            console.log("[Drawio] Getting PNG data...");
            await ref.current.exportDiagram({
                format: 'png'
            });

        } catch (error) {
            console.error("[Drawio] Failed to save diagram:", error);
            // You might want to show an error message to the user here
        }
    }, [onClose, onSubmit]);

    // Reset editor state when dialog opens/closes
    useEffect(() => {
        if (!isOpen) {
            setIsEditorReady(false);
            setEditorInstance(null);
        }
    }, [isOpen]);

    // Initialize editor
    useEffect(() => {
        if (!isOpen) return;

        const initializeEditor = async () => {
            try {
                console.log("[Drawio] Waiting for editor to initialize...");
                // Wait for a short delay to ensure the editor is ready
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Debug the ref
                console.log("[Drawio] Ref current:", ref.current);
                console.log("[Drawio] Ref current methods:", Object.keys(ref.current || {}));

                // Get the editor instance
                const editor = ref.current;
                console.log("[Drawio] Editor instance:", editor);
                console.log("[Drawio] Editor methods:", Object.keys(editor || {}));

                if (editor && typeof editor.exportDiagram === 'function') {
                    console.log("[Drawio] Got editor instance with exportDiagram method");
                    setEditorInstance(editor);
                    setIsEditorReady(true);
                } else {
                    console.error("[Drawio] Failed to get editor instance with required methods");
                }
            } catch (error) {
                console.error("[Drawio] Error initializing editor:", error);
            }
        };

        initializeEditor();
    }, [isOpen]);

    // Keyboard shortcut for CTRL/CMD+S
    useEffect(() => {
        if (!isOpen) return;
        const handler = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                handleSave();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, handleSave]);

    return (
        <>
            <DialogBackdrop {...dialog} onClick={onClose} />
            <Dialog {...dialog} aria-label="Draw.io Diagram">
                <DialogContainer>
                    <DrawioArea>
                        <DrawIoEmbed
                            ref={ref}
                            xml={initialXml ? atob(initialXml) : undefined}
                            urlParameters={{
                                ui: "dark",
                                libraries: true,
                                saveAndExit: false,
                                noExitBtn: true,
                                noSaveBtn: true
                            }}
                            configuration={{
                                defaultFonts: ["Inter"]
                            }}
                            onExport={handleExport}
                        />
                    </DrawioArea>
                    <Footer>
                        <button onClick={onClose}>Cancel</button>
                        <button onClick={handleSave} disabled={!isEditorReady}>
                            {isEditorReady ? "Save Diagram" : "Loading..."}
                        </button>
                    </Footer>
                </DialogContainer>
            </Dialog>
        </>
    );
}

const DialogContainer = styled.div`
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 32px 0 0 0;
  background: white;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
`;

const DrawioArea = styled.div`
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  padding: 0 32px;
  display: flex;
  align-items: stretch;
  justify-content: center;

  & > * {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 24px 32px 32px;
  background: none;
`;