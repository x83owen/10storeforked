const https = require('https');

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
        const { action, email, password, name } = body;
        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;
        const xmlUrl = `https://api.github.com/repos/${owner}/${repo}/contents/accounts.xml`;

        const getXml = await fetch(xmlUrl, { headers: { 'User-Agent': 'Node', Authorization: `Bearer ${token}` } });
        let fileData = await getXml.json();
        let xmlContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        if (action === "verify") {
            const userMatch = xmlContent.match(new RegExp(`<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<name>(.*?)<\\/name>[\\s\\S]*?<\\/user>`));
            return { statusCode: 200, body: JSON.stringify({ valid: !!userMatch, name: userMatch ? userMatch[1] : "" }) };
        }

        if (action === "signin") {
            const userRegex = new RegExp(`<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<password>${password}<\\/password>[\\s\\S]*?<name>(.*?)<\\/name>[\\s\\S]*?<\\/user>`);
            const match = xmlContent.match(userRegex);
            if (match) {
                return { statusCode: 200, body: JSON.stringify({ success: true, email: email, name: match[1] }) };
            }
            return { statusCode: 401, body: JSON.stringify({ error: "Invalid credentials" }) };
        }

        if (action === "signup") {
            if (xmlContent.includes(`<email>${email}</email>`)) return { statusCode: 400, body: JSON.stringify({ error: "Exists" }) };
            const newUser = `    <user>\n        <email>${email}</email>\n        <password>${password}</password>\n        <name>${name}</name>\n    </user>`;
            const updatedXml = xmlContent.replace('</accounts>', newUser + '\n</accounts>');
            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `Add ${email}`);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        if (action === "delete") {
            const verifyStr = `<email>${email}</email>`;
            const nameStr = `<name>${name}</name>`;
            const passStr = `<password>${password}</password>`;
            
            if (!xmlContent.includes(verifyStr) || !xmlContent.includes(nameStr) || !xmlContent.includes(passStr)) {
                return { statusCode: 401, body: JSON.stringify({ error: "Details do not match our records." }) };
            }

            const userRegex = new RegExp(`\\s*<user>[\\s\\S]*?<email>${email}<\\/email>[\\s\\S]*?<\\/user>`, "g");
            const updatedXml = xmlContent.replace(userRegex, "");
            await saveToGithub(xmlUrl, token, updatedXml, fileData.sha, `Delete ${email}`);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }
    } catch (e) { return { statusCode: 500, body: JSON.stringify({ error: e.message }) }; }
};

async function saveToGithub(url, token, content, sha, message) {
    const res = await fetch(url, {
        method: "PUT",
        headers: { 'User-Agent': 'Node', Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: message, content: Buffer.from(content).toString('base64'), sha: sha })
    });
    if (!res.ok) throw new Error("GitHub sync failed");
}
