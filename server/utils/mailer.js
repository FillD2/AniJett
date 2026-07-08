const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.yandex.ru',
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

async function sendVerificationCode(email, code) {
    await transporter.sendMail({
        from: process.env.SMTP_FROM || '"AniJett" <anijett.info@yandex.ru>',
        to: email,
        subject: `Ваш код подтверждения AniJett: ${code}`,
        html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0f0f12;border-radius:16px;overflow:hidden;border:1px solid #2a2a35;">
<div style="background:linear-gradient(135deg,#1a1a20,#1a100f);padding:32px 40px;text-align:center;">
<div style="font-size:28px;font-weight:800;"><span style="color:#fff;">Ani</span><span style="color:#ff5e57;">Jett</span></div>
</div>
<div style="padding:32px 40px;">
<h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Подтверждение email</h2>
<p style="color:#aaa;font-size:14px;line-height:1.6;margin:0 0 28px;">Введите этот код на странице регистрации. Код действителен 10 минут.</p>
<div style="background:#1a1a20;border:1px solid #2a2a35;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
<span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#ff5e57;">${code}</span>
</div>
<p style="color:#666;font-size:12px;margin:0;">Если вы не регистрировались на AniJett — просто проигнорируйте это письмо.</p>
</div>
<div style="padding:16px 40px;border-top:1px solid #2a2a35;text-align:center;">
<p style="color:#444;font-size:12px;margin:0;">© 2025 AniJett</p>
</div></div>`,
    });
}

module.exports = { sendVerificationCode };
