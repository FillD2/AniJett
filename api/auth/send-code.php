<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$data = json_decode(file_get_contents('php://input'), true);
$email = $data['email'] ?? '';

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Некорректный email']);
    exit;
}

$code = sprintf('%06d', rand(0, 999999));
$expires = date('Y-m-d H:i:s', strtotime('+10 minutes'));

$stmt = $pdo->prepare("INSERT INTO email_verification (email, code, expires_at) VALUES (?, ?, ?)");
$stmt->execute([$email, $code, $expires]);

// Отправка письма (замени на свои SMTP-настройки)
require_once __DIR__ . '/../../vendor/autoload.php';
$mail = new PHPMailer(true);
try {
    $mail->isSMTP();
    $mail->Host       = 'smtp.gmail.com';
    $mail->SMTPAuth   = true;
    $mail->Username   = 'your@gmail.com';
    $mail->Password   = 'your_app_password';
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = 587;
    $mail->CharSet    = 'UTF-8';
    $mail->setFrom('noreply@anijett.local', 'AniJett');
    $mail->addAddress($email);
    $mail->isHTML(false);
    $mail->Subject = 'Код подтверждения AniJett';
    $mail->Body    = "Ваш код подтверждения: $code";
    $mail->send();
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Не удалось отправить письмо']);
}