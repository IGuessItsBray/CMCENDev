require('dotenv').config();

const { sendMail } = require('../services/mailer');

function requireEnv(name) {
    const value = process.env[name];

    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value.trim();
}

async function sendTestMail() {
    const to = (process.argv[2] || process.env.TEST_MAIL_TO || '').trim();

    if (!to) {
        throw new Error(
            'Usage: npm run test:mail -- <recipient-email> or set TEST_MAIL_TO'
        );
    }

    requireEnv('SMTP_HOST');
    requireEnv('SMTP_PORT');
    requireEnv('MAIL_FROM');

    const sentAt = new Date().toISOString();
    const info = await sendMail({
        to,
        subject: `CMCEN test email - ${sentAt}`,
        html: `
            <p>This is a test email from the CMCEN mailer.</p>
            <p><strong>Sent at:</strong> ${sentAt}</p>
        `
    });

    console.log('Test email sent');
    console.log('Recipient:', to);
    console.log('Message ID:', info.messageId || 'not returned');
}

sendTestMail().catch(error => {
    console.error('Could not send test email:', error.message);
    process.exitCode = 1;
});
