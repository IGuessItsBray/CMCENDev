const nodemailer = require('nodemailer');
 
// Reads SMTP_* once at startup. No credentials — the relay

 // authenticates us by server IP.

 const transporter = nodemailer.createTransport({

   host: process.env.SMTP_HOST,

   port: Number(process.env.SMTP_PORT),

   secure: false,                      // STARTTLS upgrade, not raw TLS

   requireTLS: true

 });
 
function sendMail({ to, cc, subject, html }) {

   return transporter.sendMail({

     from: process.env.MAIL_FROM,

     replyTo: process.env.MAIL_REPLY_TO,   

     to, cc, subject, html

   });

 }
 
module.exports = { sendMail };