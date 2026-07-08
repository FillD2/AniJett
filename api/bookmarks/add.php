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
$status = $data['status'] ?? '';

$allowed = ['watching','planned','completed','dropped','onhold','notinterested','favorite'];
if (!in_array($status, $allowed)) {
    http_response_code(400);
    echo json_encode(['error' => 'Недопустимый статус']);
    exit;
}

$stmt = $pdo->prepare("INSERT INTO bookmarks (user_id, anime_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?");
$stmt->execute([$_SESSION['user_id'], $animeId, $status, $status]);

echo json_encode(['success' => true]);