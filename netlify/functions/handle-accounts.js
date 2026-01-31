const https = require('https');

// Helper to handle HTTPS requests as Promises
const fetch = (url, options = {}) => {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
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
        // Added 'rating' to destructuring
        const { action, email, password, name, appId, text, date, rating } = body;
        
        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;
        const xmlUrl = `https://api.github.com/repos/${owner}/${repo}/contents/accounts.xml`;

        const getXml = await fetch(xmlUrl, { 
            headers: { 'User-Agent': 'Node', 'Authorization': `Bearer ${token}` } 
        });
        
        if (!getXml.ok) throw new Error("Could not find accounts.xml on GitHub");
        
        let fileData = await getXml.json();
        let xmlContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // --- AUTH ACTIONS (Verify, Signin, Signup, Delete Account) ---
        if (action === "verify") {
            const userMatch = xmlContent.match(new RegExp(`<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<name>(.*?)<\\/name>[\\s\\S]*?<\\/user>`));
            return { statusCode: 200, body: JSON.stringify({ valid: !!userMatch, name: userMatch ? userMatch[1] : "" }) };
        }

        if (action === "signin") {
            const userRegex = new RegExp(`<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<password>${password}<\\/password>[\\s\\S]*?<name>(.*?)<\\/name>[\\s\\S]*?<\\/user>`);
            const match = xmlContent.match(userRegex);
            if (match) return { statusCode: 200, body: JSON.stringify({ success: true, email: email, name: match[1] }) };
            return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
        }

        if (action === "signup") {
            if (xmlContent.includes(`<email>${email}</email>`)) return { statusCode: 400, body: JSON.stringify({ error: "Account already exists" }) };
            const newUser = `    <user>\n        <email>${email}</email>\n        <password>${password}</password>\n        <name>${name}</name>\n    </user>`;
            const updatedXml = xmlContent.replace('</accounts>', newUser + '\n</accounts>');
            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `Add ${email}`);
            return { statusCode: 200, body: JSON.stringify({ success: true, name: name }) };
        }

        // --- REVIEW ACTIONS (Add, Edit, Delete) ---
        if (action === "add-review" || action === "delete-review") {
            if (!email || !appId) return { statusCode: 400, body: JSON.stringify({ error: "Missing data" }) };

            // 1. Locate the User Block
            const userBlockRegex = new RegExp(`(<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?)(<\\/user>)`);
            const match = xmlContent.match(userBlockRegex);
            if (!match) return { statusCode: 404, body: JSON.stringify({ error: "User not found" }) };

            let userContent = match[1];
            const userClosingTag = match[2];

            // 2. Check if a review for this appId already exists in the user's block
            const existingReviewRegex = new RegExp(`\\s*<review appId="${appId}"[\\s\\S]*?<\\/review>`, "g");
            
            // Remove existing review if it exists (handles "Edit" and "Delete" logic)
            userContent = userContent.replace(existingReviewRegex, "");

            // 3. If action is "add-review", append the new/updated review
            if (action === "add-review") {
                const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const newReview = `\n        <review appId="${appId}" rating="${rating || 5}"><date>${date}</date>${safeText}</review>`;
                userContent += newReview;
            }

            // 4. Reconstruct the full XML
            const updatedXml = xmlContent.replace(userBlockRegex, userContent + userClosingTag);

            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `${action} by ${email} for ${appId}`);
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
