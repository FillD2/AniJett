<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';

$data = json_decode(file_get_contents('php://input'), true);
$email = $data['email'] ?? '';
$password = $data['password'] ?? '';
$code = $data['code'] ?? '';

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Некорректный email']);
    exit;
}

$stmt = $pdo->prepare("SELECT * FROM email_verification WHERE email = ? AND code = ? AND expires_at > NOW() AND used = 0 ORDER BY id DESC LIMIT 1");
$stmt->execute([$email, $code]);
if (!$stmt->fetch()) {
    http_response_code(400);
    echo json_encode(['error' => 'Неверный или истёкший код']);
    exit;
}

$stmt = $pdo->prepare("SELECT id, email, nickname, phone, password_hash FROM users WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Неверный email или пароль']);
    exit;
}

$pdo->prepare("UPDATE email_verification SET used = 1 WHERE email = ?")->execute([$email]);

session_start();
$_SESSION['user_id'] = $user['id'];
$_SESSION['user_email'] = $user['email'];
$_SESSION['user_nickname'] = $user['nickname'];

echo json_encode(['success' => true, 'user' => ['email' => $user['email'], 'nickname' => $user['nickname'], 'phone' => $user['phone']]]);