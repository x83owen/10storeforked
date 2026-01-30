const https = require('https');

// Helper to handle HTTPS requests as Promises
const fetch = (url, options = {}) => {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                // MANUALLY SET .ok property (Node's https doesn't have it)
                res.ok = res.statusCode >= 200 && res.statusCode < 300;
                try { 
                    const parsed = JSON.parse(data);
                    res.json = () => Promise.resolve(parsed); 
                } catch (e) { 
                    res.json = () => Promise.resolve({}); 
                }
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
        // Added appId, text, date to destructuring for reviews
        const { action, email, password, name, appId, text, date } = body;
        
        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;
        const xmlUrl = `https://api.github.com/repos/${owner}/${repo}/contents/accounts.xml`;

        // 1. Get current XML from GitHub
        const getXml = await fetch(xmlUrl, { 
            headers: { 'User-Agent': 'Node', 'Authorization': `Bearer ${token}` } 
        });
        
        if (!getXml.ok) throw new Error("Could not find accounts.xml on GitHub");
        
        let fileData = await getXml.json();
        let xmlContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- ACTION: VERIFY (Used on app startup) ---
        if (action === "verify") {
            const userMatch = xmlContent.match(new RegExp(`<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<name>(.*?)<\\/name>[\\s\\S]*?<\\/user>`));
            return { 
                statusCode: 200, 
                body: JSON.stringify({ 
                    valid: !!userMatch, 
                    name: userMatch ? userMatch[1] : "" 
                }) 
            };
        }

        // --- ACTION: SIGN IN ---
        if (action === "signin") {
            const userRegex = new RegExp(`<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<password>${password}<\\/password>[\\s\\S]*?<name>(.*?)<\\/name>[\\s\\S]*?<\\/user>`);
            const match = xmlContent.match(userRegex);
            if (match) {
                return { statusCode: 200, body: JSON.stringify({ success: true, email: email, name: match[1] }) };
            }
            return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
        }

        // --- ACTION: SIGN UP ---
        if (action === "signup") {
            if (xmlContent.includes(`<email>${email}</email>`)) {
                return { statusCode: 400, body: JSON.stringify({ error: "Account already exists" }) };
            }
            
            const newUser = `    <user>\n        <email>${email}</email>\n        <password>${password}</password>\n        <name>${name}</name>\n    </user>`;
            const updatedXml = xmlContent.replace('</accounts>', newUser + '\n</accounts>');
            
            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `Add ${email}`);
            return { statusCode: 200, body: JSON.stringify({ success: true, name: name }) };
        }

        // --- ACTION: DELETE ---
        if (action === "delete") {
            const verifyRegex = new RegExp(`<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<password>${password}<\\/password>[\\s\\S]*?<name>${name}<\\/name>[\\s\\S]*?<\\/user>`);
            
            if (!verifyRegex.test(xmlContent)) {
                return { statusCode: 401, body: JSON.stringify({ error: "Details do not match our records." }) };
            }

            const userBlockRegex = new RegExp(`\\s*<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<\\/user>`, "g");
            const updatedXml = xmlContent.replace(userBlockRegex, "");
            
            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `Delete ${email}`);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        // --- ACTION: ADD REVIEW (NEW) ---
        if (action === "add-review") {
            if (!email || !appId || !text) {
                return { statusCode: 400, body: JSON.stringify({ error: "Missing review data" }) };
            }

            // 1. Sanitize text to prevent XML breakage
            const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            // 2. Find the specific user block
            // This Regex finds the user block containing the email, and captures the closing </user> tag in group 2
            const userBlockRegex = new RegExp(`(<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?)(<\\/user>)`);

            if (!userBlockRegex.test(xmlContent)) {
                return { statusCode: 404, body: JSON.stringify({ error: "User not found" }) };
            }

            // 3. Insert review before the closing </user> tag
            const newReview = `        <review appId="${appId}"><date>${date}</date>${safeText}</review>\n`;
            const updatedXml = xmlContent.replace(userBlockRegex, `$1${newReview}$2`);

            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `Add review by ${email} for ${appId}`);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

    } catch (e) { 
        console.error(e);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) }; 
    }
};

async function saveToGithub(url, token, content, sha, message) {
    const res = await fetch(url, {
        method: "PUT",
        headers: { 
            'User-Agent': 'Node', 
            'Authorization': `Bearer ${token}`, 
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
            message: message, 
            content: Buffer.from(content).toString('base64'), 
            sha: sha 
        })
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "GitHub sync failed");
    }
}
