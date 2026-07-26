const express = require('express');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const https = require('https');
const http = require('http');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// OAuth2 Credentials from the user's HTA file
const CLIENT_ID = process.env.GMAIL_CLIENT_ID || "629598156840-0uflvae6os4f40dsgrr3l2263uc5j4bc.apps.googleusercontent.com";
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "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";
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || "1//04hXXDkwmzKAcCgYIARAAGAQSNwF-L9IrwLS5Od9j4bEMGQf_ws1Q4JmYGLurmoFvJxAwQXfMR141KkLDl1Nu1qobjakWs9cCQ6o";

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, "https://developers.google.com/oauthplayground");
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

app.get('/', (req, res) => {
    res.send("שרת הענן פועל! הוסף /download?id=VIDEO_ID כדי להוריד סרטון ולשמור אותו ישירות לדרייב.");
});

async function uploadToDrive(filePath, fileName) {
    const fileMetadata = { name: fileName };
    const media = { mimeType: 'video/mp4', body: fs.createReadStream(filePath) };
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

app.get('/download', async (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send('Missing video ID');

    const outputFilename = `${videoId}.mp4`;
    const outputPath = path.join(__dirname, outputFilename);

    try {
        res.write(`Starting background download via Piped API for video ${videoId}...\n`);
        
        // Use Piped API to get stream URL bypassing YouTube bot checks
        const pipedUrl = `https://pipedapi.kavin.rocks/streams/${videoId}`;
        const pipedResponse = await fetch(pipedUrl);
        if (!pipedResponse.ok) {
            throw new Error(`Piped API failed: ${pipedResponse.status} ${pipedResponse.statusText}`);
        }
        
        const data = await pipedResponse.json();
        
        // Find a combined video+audio stream (typically 720p or 360p mp4)
        let streamUrl = null;
        if (data.videoStreams && data.videoStreams.length > 0) {
            const combinedStreams = data.videoStreams.filter(s => s.videoOnly === false && s.mimeType === "video/mp4");
            if (combinedStreams.length > 0) {
                // Get highest quality combined stream
                streamUrl = combinedStreams[0].url;
            } else {
                // Fallback to the first available stream if no combined stream is found
                streamUrl = data.videoStreams[0].url;
            }
        }
        
        if (!streamUrl) {
            throw new Error(`Piped did not return a valid video stream URL.`);
        }
        
        res.write(`Got direct URL from Piped! Downloading to server...\n`);
        
        // Download from the direct URL
        await downloadFile(streamUrl, outputPath);
        
        res.write(`Download finished on server. Starting upload to Google Drive...\n`);

        // Upload to Google Drive
        const driveResponse = await uploadToDrive(outputPath, `YoutubeDownload_${videoId}.mp4`);
        
        res.write(`\nSuccess! File uploaded to Google Drive.\nFile Link: ${driveResponse.webViewLink}\n`);
        res.end();

        // Cleanup local file
        fs.unlinkSync(outputPath);
        
    } catch (error) {
        console.error("Error process:", error);
        res.write(`\nError occurred: ${error.message}\n`);
        res.end();
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
});

app.listen(PORT, () => { console.log(`Cloud Downloader Server running on port ${PORT}`); });
