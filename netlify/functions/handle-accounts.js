// netlify/functions/handle-accounts.js
const https = require('https');

// Helper for native node-fetch (no install needed)
const fetch = (url, options = {}) => {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { res.json = () => Promise.resolve(JSON.parse(data)); } 
                catch (e) { res.json = () => Promise.resolve({}); }
                resolve(res);
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
};

exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    try {
        const body = JSON.parse(event.body);
        const { action, email, password, name, photo } = body;

        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;
        const xmlUrl = `https://api.github.com/repos/${owner}/${repo}/contents/accounts.xml`;

        // 1. Get XML
        const getXml = await fetch(xmlUrl, { headers: { 'User-Agent': 'Node', Authorization: `Bearer ${token}` } });
        let fileData = await getXml.json();
        let xmlContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- VERIFY SESSION (Auto-Login) ---
        if (action === "verify") {
            // Just check if the email exists in the XML
            if (xmlContent.includes(`<email>${email}</email>`)) {
                // Extract name and photo using simple regex
                const userBlock = xmlContent.split(`<email>${email}</email>`)[1].split('</user>')[0];
                const nameMatch = userBlock.match(/<name>(.*?)<\/name>/);
                const photoMatch = userBlock.match(/<photo>(.*?)<\/photo>/);
                
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        valid: true,
                        name: nameMatch ? nameMatch[1] : "User",
                        photo: photoMatch ? photoMatch[1] : null
                    })
                };
            }
            return { statusCode: 401, body: JSON.stringify({ valid: false }) };
        }

        // --- SIGN IN ---
        if (action === "signin") {
            const isValid = xmlContent.includes(`<email>${email}</email>`) && 
                            xmlContent.includes(`<password>${password}</password>`);
            
            if (isValid) {
                // Fetch details to return to app
                const userBlock = xmlContent.split(`<email>${email}</email>`)[1].split('</user>')[0];
                const nameMatch = userBlock.match(/<name>(.*?)<\/name>/);
                const photoMatch = userBlock.match(/<photo>(.*?)<\/photo>/);

                return { 
                    statusCode: 200, 
                    body: JSON.stringify({ 
                        success: true, 
                        email: email,
                        name: nameMatch ? nameMatch[1] : "User",
                        photo: photoMatch ? photoMatch[1] : null
                    }) 
                };
            }
            return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
        }

        // --- SIGN UP (With Photo & Name) ---
        if (action === "signup") {
            if (xmlContent.includes(`<email>${email}</email>`)) {
                return { statusCode: 400, body: JSON.stringify({ error: "Account exists" }) };
            }

            // Create XML entry (Ensure photo is a safe Base64 string)
            const newUser = `    <user>\n        <email>${email}</email>\n        <password>${password}</password>\n        <name>${name}</name>\n        <photo>${photo || ""}</photo>\n    </user>`;
            const updatedXml = xmlContent.replace('</accounts>', newUser + '\n</accounts>');

            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `Add user ${email}`);
            return { statusCode: 200, body: JSON.stringify({ success: true, email: email }) };
        }

        // --- DELETE ACCOUNT ---
        if (action === "delete") {
            if (!xmlContent.includes(`<email>${email}</email>`) || !xmlContent.includes(`<password>${password}</password>`)) {
                return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
            }

            // Regex to remove the specific user block
            const userRegex = new RegExp(`\\s*<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<\\/user>`, "g");
            const updatedXml = xmlContent.replace(userRegex, "");

            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `Delete user ${email}`);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

async function saveToGithub(url, token, content, sha, message) {
    const put = await fetch(url, {
        method: "PUT",
        headers: {
            'User-Agent': 'Node',
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: message,
            content: Buffer.from(content).toString('base64'),
            sha: sha
        })
    });
    if (!put.ok) throw new Error("GitHub Save Failed");
}
