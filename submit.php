<?php

// SECURE: Your GitHub token stays on the server only
$token = "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";
$owner = "draydenthemiiyt-maker";
$repo  = "draymusic.github.io";
$file  = "10store/appspending.xml";

// --- RATE LIMIT: Max 3 requests per IP per hour ---
$ip = $_SERVER['REMOTE_ADDR'];
$rateDir = __DIR__ . "/rate_limits";

if (!is_dir($rateDir)) {
    mkdir($rateDir, 0777, true);
}

$ipFile = "$rateDir/" . md5($ip) . ".json";

// If no file exists, create a new one
if (!file_exists($ipFile)) {
    file_put_contents($ipFile, json_encode([
        "count" => 1,
        "start" => time()
    ]));
} else {
    $data = json_decode(file_get_contents($ipFile), true);

    // Reset after 1 hour
    if (time() - $data["start"] > 3600) {
        $data = ["count" => 1, "start" => time()];
    } else {
        if ($data["count"] >= 3) {
            echo json_encode(["success" => false, "error" => "Rate limit exceeded. Try again in 1 hour."]);
            exit;
        }
        $data["count"]++;
    }

    file_put_contents($ipFile, json_encode($data));
}
// --- END RATE LIMIT ---
// Read JSON input
$data = json_decode(file_get_contents("php://input"), true);

if (!$data) {
    echo json_encode(["success" => false, "error" => "Invalid JSON"]);
    exit;
}

// Escape XML safely
function escapeXml($str) {
    return htmlspecialchars($str, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

// Generate ID
$appId = strtolower(preg_replace('/[^a-z0-9]+/', '-', $data["name"]));

// Build screenshots XML
$screenshots = "";
$i = 1;
foreach ($data["screenshots"] as $shot) {
    $screenshots .= "      <screenshot$i>" . escapeXml($shot) . "</screenshot$i>\n";
    $i++;
}

// Build XML snippet
$xmlSnippet = "    <app id=\"$appId\">
      <name>" . escapeXml($data["name"]) . "</name>
      <version>" . escapeXml($data["version"]) . "</version>
      <icon>" . escapeXml($data["icon"]) . "</icon>
      <publisher>" . escapeXml($data["publisher"]) . "</publisher>
      <description>" . escapeXml($data["description"]) . "</description>
      <package>" . escapeXml($data["package"]) . "</package>
$screenshots      <pcCapable>" . ($data["pcCapable"] ? "true" : "false") . "</pcCapable>
      <mobileCapable>" . ($data["mobileCapable"] ? "true" : "false") . "</mobileCapable>
    </app>\n";

// STEP 1: Fetch existing XML from GitHub
$apiUrl = "https://api.github.com/repos/$owner/$repo/contents/$file";

$opts = [
    "http" => [
        "header" => "User-Agent: PHP\r\nAuthorization: token $token\r\n"
    ]
];
$context = stream_context_create($opts);
$response = json_decode(file_get_contents($apiUrl, false, $context), true);

if (!isset($response["content"])) {
    echo json_encode(["success" => false, "error" => "File not found"]);
    exit;
}

$currentContent = base64_decode($response["content"]);

// STEP 2: Append new app entry BEFORE </apps>
$updated = str_replace("</apps>", $xmlSnippet . "  </apps>", $currentContent);

// STEP 3: Push updated XML back to GitHub
$payload = json_encode([
    "message" => "New pending app: " . $data["name"],
    "content" => base64_encode($updated),
    "sha" => $response["sha"]
]);

$opts = [
    "http" => [
        "method" => "PUT",
        "header" => "User-Agent: PHP\r\nAuthorization: token $token\r\nContent-Type: application/json\r\n",
        "content" => $payload
    ]
];
$context = stream_context_create($opts);
$result = file_get_contents($apiUrl, false, $context);

echo json_encode(["success" => true]);
?>
