import type MarkdownIt from "markdown-it";

// --- Drawio plugin ---
function drawioRule(md: MarkdownIt) {
    console.log("[DrawioPlugin] Initializing drawioRule");
    md.core.ruler.after("inline", "drawio", function (state: any) {
        const tokens = state.tokens;
        for (let i = 0; i < tokens.length - 1; i++) {
            // Look for an image token followed by an html_inline comment
            const img = tokens[i];
            const comment = tokens[i + 1];
            if (
                img.type === "inline" &&
                img.children &&
                img.children.length === 1 &&
                img.children[0].type === "image" &&
                (comment.type === "html_inline" || comment.type === "html_block") &&
                comment.content.trim().startsWith("<!-- drawio:xml=")
            ) {
                // Extract info
                const imageToken = img.children[0];
                const alt = imageToken.content;
                const src = imageToken.attrGet("src");
                const filename = alt || "diagram.png";
                const xmlComment = comment.content.trim();
                const xmlFilenameMatch = xmlComment.match(/<!-- drawio:xml=([^\s>]+) ?-->/);
                const xmlFilename = xmlFilenameMatch ? xmlFilenameMatch[1] : "";
                // Trace logging
                console.log("[DrawioRule] Matched drawio image+comment", { src, filename, xmlFilename });
                // Create a new token
                const drawioToken = new state.Token("drawio_block", "drawio-diagram", 0);
                drawioToken.block = true;
                drawioToken.attrs = [
                    ["imageUrl", src],
                    ["filename", filename],
                    ["xmlFilename", xmlFilename],
                ];
                // Remove the two tokens and insert the new one
                tokens.splice(i, 2, drawioToken);
                // Step back to handle consecutive drawio blocks
                i--;
            }
        }
        return false;
    });
}

export default drawioRule; 