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

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const client = url.startsWith('https') ? https : http;
        client.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

app.post('/eval', async (req, res) => {
    try {
        const code = req.body.code;
        const result = await eval(`(async () => { ${code} })()`);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, stack: err.stack });
    }
});

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

app.get('/test-cobalt', async (req, res) => {
    try {
        const axios = require('axios');
        const cobaltRes = await axios.post('https://api.cobalt.tools', {
            url: 'https://www.youtube.com/watch?v=nvyWXABq4ww',
            videoQuality: '720'
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        res.json({ success: true, data: cobaltRes.data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.response ? err.response.data : err.message });
    }
});

app.get('/testzip', async (req, res) => {
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        const fs = require('fs');
        fs.writeFileSync('test.txt', 'hello');
        const out = await execAsync('zip -P 1234 -0j test.zip test.txt');
        res.json({ success: true, out });
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

const youtubedl = require('youtube-dl-exec');

app.get('/download', async (req, res) => {
    const videoId = req.query.id;
    const type = req.query.type || 'video'; // 'video' or 'audio'
    const wantZip = req.query.zip === 'true';
    
    if (!videoId) return res.status(400).json({ error: 'Missing video ID' });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    
    // Heartbeat to keep the connection alive (Render drops silent connections after 100s)
    const heartbeat = setInterval(() => {
        try {
            res.write(' '); // JSON ignores whitespace
        } catch(e) {
            clearInterval(heartbeat);
        }
    }, 15000);
    
    req.on('close', () => clearInterval(heartbeat));

    const ext = type === 'audio' ? 'mp3' : 'mp4';
    const outputFilename = `${videoId}.${ext}`;
    const outputPath = path.join(__dirname, outputFilename);

    try {
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
        
        let finalFilename = outputFilename;
        
        if (wantZip) {
            finalFilename = `${videoId}.zip`;
            const zipPath = path.join(__dirname, finalFilename);
            
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            
            try {
                // -P password, -0 store only (no compression), -j junk path (just the file)
                await execAsync(`zip -P 1234 -0j "${zipPath}" "${outputPath}"`, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
            } catch (zipErr) {
                console.error("Native zip failed:", zipErr);
                throw new Error("Failed to zip the file");
            }
            
            // Delete the original raw file after zipping
            fs.unlink(outputPath, () => {});
        }
        
        let driveLink = null;
        if (req.query.drive === 'true') {
            let mimeType = 'video/mp4';
            if (wantZip) mimeType = 'application/zip';
            else if (type === 'audio') mimeType = 'audio/mpeg';
            
            const driveRes = await uploadToDrive(path.join(__dirname, finalFilename), finalFilename, mimeType);
            driveLink = driveRes.webViewLink;
            
            if (req.query.email) {
                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                const emailLines = [
                    `To: ${req.query.email}`,
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
            }
        }
        
        const fileUrl = driveLink || `https://my-downloader2.onrender.com/files/${finalFilename}`;
        clearInterval(heartbeat);
        res.write(JSON.stringify({ success: true, url: fileUrl, type: type, zipped: wantZip, drive: !!driveLink }));
        res.end();
    } catch (error) {
        console.error("Error process:", error);
        clearInterval(heartbeat);
        res.write(JSON.stringify({ success: false, error: error.message }));
        res.end();
    }
});

app.listen(PORT, () => { console.log(`Cloud Downloader Server running on port ${PORT}`); });
