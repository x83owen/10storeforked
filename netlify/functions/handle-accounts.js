exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        const { action, email, password } = body;

        // Ensure we are only handling signups here based on your request
        if (action !== "signup") {
            return { statusCode: 400, body: JSON.stringify({ error: "Invalid action" }) };
        }

        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER;
        const repo = process.env.REPO_NAME;

        if (!token || !owner || !repo) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing configuration secrets" }) };
        }

        const xmlUrl = `https://api.github.com/repos/${owner}/${repo}/contents/accounts.xml`;

        // --- STEP 1: GET CURRENT ACCOUNTS.XML ---
        const getXml = await fetch(xmlUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        let fileData;
        let oldContent = "<accounts>\n</accounts>";
        let sha = null;

        if (getXml.ok) {
            fileData = await getXml.json();
            oldContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
            sha = fileData.sha;
        } else if (getXml.status !== 404) {
            throw new Error("Error accessing GitHub repository");
        }

        // --- STEP 2: CHECK IF EMAIL EXISTS ---
        if (oldContent.includes(`<email>${email}</email>`)) {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ error: "An account with this email already exists." }) 
            };
        }

        // --- STEP 3: CONSTRUCT USER SNIPPET ---
        const userSnippet = `    <user>
        <email>${email}</email>
        <password>${password}</password>
    </user>`;

        // --- STEP 4: UPDATE CONTENT ---
        // Insert before the closing tag
        const newContent = oldContent.replace('</accounts>', userSnippet + '\n</accounts>');

        // --- STEP 5: PUSH TO GITHUB ---
        const putXml = await fetch(xmlUrl, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `New user registration: ${email}`,
                content: Buffer.from(newContent).toString('base64'),
                sha: sha // Required by GitHub to update existing files
            })
        });

        if (!putXml.ok) {
            const errLog = await putXml.text();
            throw new Error("Failed to save accounts.xml: " + errLog);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: "Account created successfully!" })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
