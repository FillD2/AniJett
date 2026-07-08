<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';

$data = json_decode(file_get_contents('php://input'), true);
$email = $data['email'] ?? '';
$password = $data['password'] ?? '';
$nickname = $data['nickname'] ?? '';
$phone = $data['phone'] ?? '';
$code = $data['code'] ?? '';

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6 || strlen($nickname) < 3) {
    http_response_code(400);
    echo json_encode(['error' => 'Некорректные данные']);
    exit;
}

$stmt = $pdo->prepare("SELECT * FROM email_verification WHERE email = ? AND code = ? AND expires_at > NOW() AND used = 0 ORDER BY id DESC LIMIT 1");
$stmt->execute([$email, $code]);
$verification = $stmt->fetch();

if (!$verification) {
    http_response_code(400);
    echo json_encode(['error' => 'Неверный или истёкший код']);
    exit;
}

$pdo->prepare("UPDATE email_verification SET used = 1 WHERE id = ?")->execute([$verification['id']]);

$stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
$stmt->execute([$email]);
if ($stmt->fetch()) {
    http_response_code(409);
    echo json_encode(['error' => 'Пользователь с таким email уже существует']);
    exit;
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$stmt = $pdo->prepare("INSERT INTO users (email, nickname, phone, password_hash) VALUES (?, ?, ?, ?)");
$stmt->execute([$email, $nickname, $phone, $hash]);

session_start();
$_SESSION['user_id'] = $pdo->lastInsertId();
$_SESSION['user_email'] = $email;
$_SESSION['user_nickname'] = $nickname;

echo json_encode(['success' => true, 'user' => ['email' => $email, 'nickname' => $nickname, 'phone' => $phone]]);