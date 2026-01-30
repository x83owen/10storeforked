// netlify/functions/handle-accounts.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        const { action, email, password } = body;

        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;
        const xmlUrl = `https://api.github.com/repos/${owner}/${repo}/contents/accounts.xml`;

        // 1. Get current XML from GitHub
        const getXml = await fetch(xmlUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        let fileData = { content: Buffer.from("<accounts></accounts>").toString('base64'), sha: null };
        if (getXml.ok) {
            fileData = await getXml.json();
        }

        let oldContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- ACTION: SIGN IN ---
        if (action === "signin") {
            const userMatch = oldContent.includes(`<email>${email}</email>`) && 
                              oldContent.includes(`<password>${password}</password>`);
            
            if (userMatch) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({ success: true, email: email })
                };
            } else {
                return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
            }
        }

        // --- ACTION: SIGN UP ---
        if (action === "signup") {
            if (oldContent.includes(`<email>${email}</email>`)) {
                return { statusCode: 400, body: JSON.stringify({ error: "User already exists" }) };
            }

            const userSnippet = `    <user>\n        <email>${email}</email>\n        <password>${password}</password>\n    </user>`;
            const newContent = oldContent.replace('</accounts>', userSnippet + '\n</accounts>');

            const putXml = await fetch(xmlUrl, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: `New User: ${email}`,
                    content: Buffer.from(newContent).toString('base64'),
                    sha: fileData.sha
                })
            });

            if (!putXml.ok) throw new Error("Failed to write to GitHub");

            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
