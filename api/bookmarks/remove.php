<?php
session_start();
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Не авторизован']);
    exit;
}
require_once __DIR__ . '/../../config/database.php';

$data = json_decode(file_get_contents('php://input'), true);
$animeId = $data['anime_id'] ?? 0;

$stmt = $pdo->prepare("DELETE FROM bookmarks WHERE user_id = ? AND anime_id = ?");
$stmt->execute([$_SESSION['user_id'], $animeId]);

echo json_encode(['success' => true]);