<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$kodikId = $_GET['kodikId'] ?? '';
$season = $_GET['season'] ?? 1;
$episode = $_GET['episode'] ?? 1;

if (empty($kodikId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing kodikId']);
    exit;
}

$playerUrl = "https://cvh.animego.org/embed/{$kodikId}?season={$season}&episode={$episode}";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $playerUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
curl_setopt($ch, CURLOPT_REFERER, 'https://yourdomain.com/');

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200) {
    header('Content-Type: text/html');
    echo $response;
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to load player']);
}