import React, { useRef, useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { Dialog, DialogBackdrop, useDialogState } from "reakit/Dialog";
import { DrawIoEmbed } from "react-drawio";
import { uploadImage, uploadXmlAttachment } from "@shared/utils/uploadImage";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    initialXml?: string;
    onSubmit: (res: { xml: string; imageUrl: string; filename: string; xmlFilename: string }) => void;
    initialFilename?: string;
}

interface ExportData {
    data: string;
    format: string;
    xml: string;
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
    initialFilename,
}: Props) {
    const ref = useRef<any>();
    const dialogRef = useRef<HTMLDivElement>(null);
    const dialog = useDialogState({ visible: isOpen });
    const [isEditorReady, setIsEditorReady] = useState(false);
    const [editorInstance, setEditorInstance] = useState<any>(null);
    const [filename, setFilename] = useState(initialFilename || "New Diagram");
    const filenameRef = useRef(filename);

    useEffect(() => {
        if (isOpen) {
            setFilename(initialFilename || "New Diagram");
            filenameRef.current = initialFilename || "New Diagram";
            console.log("[Drawio] Filename initialized:", initialFilename || "New Diagram");
        }
    }, [isOpen, initialFilename]);

    const handleFilenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilename(e.target.value);
        filenameRef.current = e.target.value;
        console.log("[Drawio] Filename changed:", e.target.value);
    };

    const handleExport = useCallback(async (data: ExportData) => {
        const exportFilename = filenameRef.current;
        console.log("[Drawio] Export data received:", data);
        console.log("[Drawio] Using filename for export (ref):", exportFilename);
        const file = dataURLtoFile(data.data, exportFilename);
        console.log("[Drawio] Converted to File object with filename:", exportFilename);
        const xmlFilename = `${exportFilename}.xml`;
        // Create a File object for the XML
        const xmlFile = new File([data.xml], xmlFilename, { type: "text/xml" });
        try {
            // Upload image
            const imageUrl = await uploadImage(file);
            console.log("[Drawio] Image uploaded successfully", imageUrl);
            // Upload XML
            const xmlUrl = await uploadXmlAttachment(xmlFile);
            console.log("[Drawio] XML uploaded successfully", xmlUrl);
            onSubmit({
                xml: "", // Do not inline XML in markdown, only use for editing
                imageUrl,
                filename: exportFilename,
                xmlFilename: xmlUrl, // Use the URL of the uploaded XML
            });
            onClose();
        } catch (error) {
            console.error("[Drawio] Failed to upload image or XML:", error);
            throw new Error("Failed to upload image or XML");
        }
    }, [onSubmit, onClose]);

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
                await new Promise(resolve => setTimeout(resolve, 1000));

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

    useEffect(() => {
        if (initialXml) {
            console.log("[Drawio] Passing plain XML to DrawIoEmbed (first 100 chars):", initialXml.substring(0, 100));
        }
    }, [initialXml]);

    return (
        <>
            <DialogBackdrop {...dialog} onClick={onClose} />
            <Dialog {...dialog} aria-label="Draw.io Diagram" ref={dialogRef}>
                <DialogContainer>
                    <DrawioArea>
                        <DrawIoEmbed
                            ref={ref}
                            xml={initialXml || undefined}
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
                        <label style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, color: '#888', marginRight: 8 }}>Filename:</span>
                            <input
                                type="text"
                                value={filename}
                                onChange={handleFilenameChange}
                                style={{ fontSize: 14, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', width: 200 }}
                            />
                        </label>
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