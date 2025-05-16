import React, { useRef, useCallback } from "react";
import Modal from "@components/Modal";
import Drawio from "react-drawio";
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

    const handleSave = useCallback(async () => {
        try {
            console.log("[Drawio] Starting save process");
            const xml = await ref.current?.getXml();
            console.log("[Drawio] Got XML", xml?.substring(0, 50) + "...");
            const png = await ref.current?.getPng();
            console.log("[Drawio] Got PNG data URL");

            // Convert PNG data URL to File
            const file = dataURLtoFile(png, "diagram.png");
            console.log("[Drawio] Converted to File object");

            // Upload using Outline's image upload
            console.log("[Drawio] Starting image upload");
            const imageUrl = await uploadImage(file);
            console.log("[Drawio] Image uploaded successfully", imageUrl);

            onSubmit({
                xml: btoa(xml),  // base64 encode XML
                imageUrl
            });
            onClose();
        } catch (error) {
            console.error("[Drawio] Failed to save diagram:", error);
        }
    }, [onClose, onSubmit]);

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={onClose}
            title="Draw.io Diagram"
            width="full"
        >
            <div style={{ height: "80vh", width: "100%" }}>
                <Drawio
                    ref={ref}
                    xml={initialXml ? atob(initialXml) : undefined}
                    config={{
                        theme: "dark",
                        defaultFonts: ["Inter"],
                    }}
                />
            </div>
            <Modal.Footer>
                <button onClick={onClose}>Cancel</button>
                <button onClick={handleSave} type="primary">
                    Save Diagram
                </button>
            </Modal.Footer>
        </Modal>
    );
} 