const express = require('express');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const https = require('https');
const http = require('http');

dotenv.config();

const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// Catch crashes
process.on('uncaughtException', (err) => {
    fs.appendFileSync('crash.log', `[${new Date().toISOString()}] Uncaught Exception: ${err.message}\n${err.stack}\n\n`);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    fs.appendFileSync('crash.log', `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n\n`);
    process.exit(1);
});

const debugLogs = [];
const origLog = console.log;
const origError = console.error;
console.log = (...args) => {
    origLog(...args);
    debugLogs.push(`[LOG] ${new Date().toISOString()} ${args.join(' ')}`);
    if (debugLogs.length > 200) debugLogs.shift();
};
console.error = (...args) => {
    origError(...args);
    debugLogs.push(`[ERR] ${new Date().toISOString()} ${args.join(' ')}`);
    if (debugLogs.length > 200) debugLogs.shift();
};

app.get('/debug-logs', (req, res) => {
    res.type('text').send(debugLogs.join('\n'));
});

app.get('/crashlogs', (req, res) => {
    if (fs.existsSync('crash.log')) {
        res.send(fs.readFileSync('crash.log', 'utf8'));
    } else {
        res.send("No crash logs found.");
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// OAuth2 Credentials from the user's HTA file
const CLIENT_ID = process.env.GMAIL_CLIENT_ID || "629598156840-0uflvae6os4f40dsgrr3l2263uc5j4bc.apps.googleusercontent.com";
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "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";
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || ("1//04SKxwGHc4I3vCgYIARAAGAQSNwF-L9IrEKc895tJS" + "94nvnYUNRgr5ortxpVCOvsEd8DKouHvNoMBux3Mhpku7YWYuS7ViJkPkT4");

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, "https://developers.google.com/oauthplayground");
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

app.get('/', (req, res) => {
    res.send("שרת הענן פועל! הוסף /download?id=VIDEO_ID כדי להוריד סרטון ולשמור אותו ישירות לדרייב.");
});

async function uploadToDrive(filePath, fileName, mimeType) {
    const fileMetadata = { name: fileName };
    const media = { mimeType: mimeType || 'application/octet-stream', body: fs.createReadStream(filePath) };
    const res = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id, name, webViewLink' });
    return res.data;
}

app.use('/files', express.static(__dirname));

app.post('/update-cookies', (req, res) => {
    try {
        const cookies = req.body.cookies;
        if (!cookies) return res.status(400).json({ success: false, error: 'No cookies provided' });
        fs.writeFileSync(path.join(__dirname, 'cookies.txt'), cookies);
        console.log("Cookies updated successfully via extension.");
        res.json({ success: true, message: 'Cookies updated' });
    } catch (err) {
        console.error("Failed to update cookies:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const youtubedl = require('youtube-dl-exec');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const jobs = new Map();

app.get('/api/job-state', (req, res) => {
    const jobId = req.query.jobId;
    if (!jobId || !jobs.has(jobId)) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json(jobs.get(jobId));
});

app.all('/download', async (req, res) => {
    const videoId = req.query.id || req.body.id;
    const type = (req.query.type || req.body.type) || 'video';
    const wantZip = req.query.zip === 'true' || req.body.zip === true || req.body.zip === 'true';
    const wantDrive = req.query.drive === 'true' || req.body.drive === true || req.body.drive === 'true';
    const emailStr = req.query.email || req.body.email;
    
    if (!videoId) return res.status(400).json({ error: 'Missing video ID' });

    const jobId = Date.now().toString();
    jobs.set(jobId, { status: 'processing', logs: ['בקשה התקבלה בשרת. מתחיל עיבוד...'] });
    
    const log = (msg) => {
        console.log(`[Job ${jobId}] ${msg}`);
        const job = jobs.get(jobId);
        if (job) {
            job.logs.push(msg);
        }
    };

    // Return immediately to prevent timeouts
    res.json({ success: true, jobId: jobId });

    // Run in background
    (async () => {
        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const outputFilename = `${videoId}.${ext}`;
        const outputPath = path.join(__dirname, outputFilename);

        try {
            log('מתחיל הורדה מיוטיוב...');
            const formatArg = type === 'audio' ? 'bestaudio/best' : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            const options = {
                cookies: path.join(__dirname, 'cookies.txt'),
                noCheckCertificates: true,
                jsRuntimes: 'node',
                output: outputPath,
                format: formatArg
            };
            
            if (type === 'audio') {
                options.extractAudio = true;
                options.audioFormat = 'mp3';
            }
            
            await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, options);
            log('ההורדה מיוטיוב הסתיימה בהצלחה.');
            
            let finalFilename = outputFilename;
            
            if (wantZip) {
                log('אורז את הקובץ ל-ZIP, אנא המתן (זה עשוי לקחת קצת זמן)...');
                finalFilename = `${videoId}.zip`;
                const zipPath = path.join(__dirname, finalFilename);
                
                try {
                    await execAsync(`zip -P 1234 -0j "${zipPath}" "${outputPath}"`, { maxBuffer: 1024 * 1024 * 10 });
                } catch (zipErr) {
                    console.error("Native zip failed:", zipErr);
                    log('שגיאה באריזת ZIP!');
                    throw new Error("Failed to zip the file");
                }
                
                fs.unlink(outputPath, () => {});
                log('אריזת ה-ZIP הסתיימה בהצלחה.');
            }
            
            let driveLink = null;
            if (wantDrive) {
                log('מעלה לגוגל דרייב...');
                let mimeType = 'video/mp4';
                if (wantZip) mimeType = 'application/zip';
                else if (type === 'audio') mimeType = 'audio/mpeg';
                
                const driveRes = await uploadToDrive(path.join(__dirname, finalFilename), finalFilename, mimeType);
                driveLink = driveRes.webViewLink;
                log('ההעלאה לדרייב הסתיימה בהצלחה!');
                
                if (emailStr) {
                    try {
                        log(`שולח אימייל לכתובת: ${emailStr}...`);
                        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                        const emailLines = [
                            `To: ${emailStr}`,
                            `Subject: =?utf-8?B?${Buffer.from("ההורדה שלך מיוטיוב מוכנה!").toString('base64')}?=`,
                            `Content-Type: text/html; charset=utf-8`,
                            ``,
                            `<div dir="rtl">`,
                            `<h3>הקובץ שלך מוכן</h3>`,
                            `<p>הורדת את הסרטון בהצלחה. הקובץ נשמר בגוגל דרייב שלך.</p>`,
                            `<p><a href="${driveLink}">לחץ כאן כדי לצפות או להוריד את הקובץ מהדרייב</a></p>`,
                            `</div>`
                        ];
                        const emailRaw = Buffer.from(emailLines.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                        await gmail.users.messages.send({
                            userId: 'me',
                            requestBody: { raw: emailRaw }
                        });
                        log('אימייל נשלח בהצלחה!');
                    } catch (emailErr) {
                        console.error("Email send failed:", emailErr);
                        log('שגיאה בשליחת האימייל (חסרות הרשאות), אבל הקובץ בדרייב!');
                    }
                }
            }
            
            const fileUrl = driveLink || `https://my-downloader2.onrender.com/files/${finalFilename}`;
            jobs.set(jobId, { status: 'done', success: true, url: fileUrl, type: type, zipped: wantZip, drive: !!driveLink, logs: jobs.get(jobId).logs });
            log('המשימה הסתיימה לחלוטין!');
            
        } catch (error) {
            console.error("Error process:", error);
            log(`שגיאה: ${error.message}`);
            jobs.set(jobId, { status: 'error', success: false, error: error.message, logs: jobs.get(jobId).logs });
        }
    })();
});

app.listen(PORT, () => { console.log(`Cloud Downloader Server running on port ${PORT}`); });
