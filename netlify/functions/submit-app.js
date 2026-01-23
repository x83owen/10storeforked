// netlify/functions/submit-app.js
exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        // The frontend now sends raw app data + iconBase64 instead of a pre-made snippet
        const { id, name, pub, ver, pkg, desc, pc, mobile, iconBase64, iconName } = body;

        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;

        if (!token || !owner || !repo) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing configuration secrets" }) };
        }

        // --- STEP 1: UPLOAD THE ICON TO GITHUB ---
        // We save it in a folder called 'icons' using the app ID to keep it unique
        const iconPath = `icons/${id}-${iconName}`;
        const iconUploadUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${iconPath}`;

        const iconResponse = await fetch(iconUploadUrl, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Upload icon for ${name}`,
                content: iconBase64 // This is the Base64 string from the browser
            })
        });

        if (!iconResponse.ok) {
            const errLog = await iconResponse.text();
            throw new Error("Failed to upload icon to GitHub: " + errLog);
        }

        // This is the direct link to the icon on GitHub that your app store will use
        const finalIconLink = `https://raw.githubusercontent.com/${owner}/${repo}/main/${iconPath}`;

        // --- STEP 2: CONSTRUCT THE XML SNIPPET ---
        const xmlSnippet = '    <app id="' + id + '">\n' +
                           '      <name>' + name + '</name>\n' +
                           '      <version>' + ver + '</version>\n' +
                           '      <icon>' + finalIconLink + '</icon>\n' +
                           '      <publisher>' + pub + '</publisher>\n' +
                           '      <featured>false</featured>\n' +
                           '      <description>' + desc + '</description>\n' +
                           '      <package>' + pkg + '</package>\n' +
                           '      <pcCapable>' + (pc ? "true" : "false") + '</pcCapable>\n' +
                           '      <mobileCapable>' + (mobile ? "true" : "false") + '</mobileCapable>\n' +
                           '    </app>';

        // --- STEP 3: UPDATE APPS.XML ---
        const xmlUrl = `https://api.github.com/repos/${owner}/${repo}/contents/apps.xml`;

        const getXml = await fetch(xmlUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!getXml.ok) throw new Error("Could not find apps.xml");
        
        const fileData = await getXml.json();
        const oldContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // Insert before closing tag
        const newContent = oldContent.replace('</apps>', xmlSnippet + '\n  </apps>');

        const putXml = await fetch(xmlUrl, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Auto-added app: ${name}`,
                content: Buffer.from(newContent).toString('base64'),
                sha: fileData.sha 
            })
        });

        if (!putXml.ok) throw new Error("Failed to save apps.xml to GitHub");

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: "Icon uploaded and App added!" })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
