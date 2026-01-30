// netlify/functions/handle-accounts.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    try {
        const { action, email, password } = JSON.parse(event.body);
        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;
        const xmlUrl = `https://api.github.com/repos/${owner}/${repo}/contents/accounts.xml`;

        // 1. Fetch current accounts from GitHub
        const getXml = await fetch(xmlUrl, { headers: { Authorization: `Bearer ${token}` } });
        let fileData = { content: Buffer.from("<accounts></accounts>").toString('base64'), sha: null };
        
        if (getXml.ok) {
            fileData = await getXml.json();
        }
        
        let xmlContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- SIGN IN LOGIC ---
        if (action === "signin") {
            const success = xmlContent.includes(`<email>${email}</email>`) && 
                            xmlContent.includes(`<password>${password}</password>`);
            
            if (success) {
                return { statusCode: 200, body: JSON.stringify({ success: true, email: email }) };
            }
            return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
        }

        // --- SIGN UP LOGIC ---
        if (action === "signup") {
            if (xmlContent.includes(`<email>${email}</email>`)) {
                return { statusCode: 400, body: JSON.stringify({ error: "User already exists" }) };
            }

            const newUser = `    <user>\n        <email>${email}</email>\n        <password>${password}</password>\n    </user>`;
            const updatedXml = xmlContent.replace('</accounts>', newUser + '\n</accounts>');

            const putXml = await fetch(xmlUrl, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `New User: ${email}`,
                    content: Buffer.from(updatedXml).toString('base64'),
                    sha: fileData.sha
                })
            });

            if (!putXml.ok) throw new Error("GitHub write failed");
            return { statusCode: 200, body: JSON.stringify({ success: true, email: email }) };
        }

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
