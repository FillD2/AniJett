<?php
session_start();
if (!isset($_SESSION['user_id'])) {
    echo json_encode([]);
    exit;
}
require_once __DIR__ . '/../../config/database.php';

$stmt = $pdo->prepare("SELECT anime_id, status FROM bookmarks WHERE user_id = ?");
$stmt->execute([$_SESSION['user_id']]);
$bookmarks = [];
while ($row = $stmt->fetch()) {
    $bookmarks[$row['anime_id']] = $row['status'];
}
echo json_encode($bookmarks);