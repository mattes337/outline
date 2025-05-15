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
            const xml = await ref.current?.getXml();
            const png = await ref.current?.getPng();

            // Convert PNG data URL to File
            const file = dataURLtoFile(png, "diagram.png");

            // Upload using Outline's image upload
            const imageUrl = await uploadImage(file);

            onSubmit({
                xml: btoa(xml),  // base64 encode XML
                imageUrl
            });
            onClose();
        } catch (error) {
            console.error("Failed to save diagram:", error);
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