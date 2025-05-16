import { AttachmentPreset } from "@shared/types";
import { uploadFile } from "~/utils/files";
import { AttachmentValidation } from "@shared/validations";

// Basic placeholder for image upload utility
// Replace with Outline's actual upload logic if available
export async function uploadImage(file: File): Promise<string> {
    // Validate that the file is an image
    if (!AttachmentValidation.imageContentTypes.includes(file.type)) {
        throw new Error("File must be an image");
    }

    const attachment = await uploadFile(file, {
        preset: AttachmentPreset.DocumentAttachment,
        name: file.name,
    });

    // Return the URL of the uploaded attachment
    // For document attachments, we use the redirectUrl which is used by the serializer
    // to detect attachment vs link
    return attachment.url;
} 