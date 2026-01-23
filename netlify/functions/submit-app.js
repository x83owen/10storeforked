// netlify/functions/submit-app.js
exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        const { xmlSnippet, appName } = body;

        // 1. Get settings from Netlify Environment
        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;
        const path = "apps.xml"; // The file we want to edit

        if (!token || !owner || !repo) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing configuration secrets" }) };
        }

        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

        // 2. Fetch the CURRENT apps.xml
        // We use standard 'fetch' here. If your node version is old, you might need 'node-fetch'
        // but Netlify usually supports standard fetch now.
        const getResponse = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!getResponse.ok) throw new Error("Could not find apps.xml");
        
        const fileData = await getResponse.json();
        const oldContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // 3. Insert the new App
        // We look for the closing </apps> tag and put our new app right before it
        const newContent = oldContent.replace('</apps>', xmlSnippet + '\n  </apps>');

        // 4. Save the file back to GitHub
        const putResponse = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Auto-added app: ${appName}`,
                content: Buffer.from(newContent).toString('base64'),
                sha: fileData.sha // This proves we are editing the latest version
            })
        });

        if (!putResponse.ok) throw new Error("Failed to save to GitHub");

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: "App added successfully!" })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
