const express = require('express');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const dotenv = require('dotenv');

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
    const fileMetadata = {
        name: fileName,
        // We can upload to the root of the user's drive if no folderId is specified
    };
    
    const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(filePath)
    };

    console.log(`Uploading ${fileName} to Google Drive...`);
    
    const res = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink'
    });
    
    return res.data;
}

app.get('/download', async (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send('Missing video ID');

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outputFilename = `${videoId}.mp4`;
    const outputPath = path.join(__dirname, outputFilename);

    console.log(`Starting download for: ${videoId}`);
    
    try {
        res.write(`Starting background download for video ${videoId}...\n`);
        
        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (!fs.existsSync(cookiesPath)) {
            throw new Error("Cookies file not found on the server! Cannot bypass bot protection.");
        }

        // 1. Download Video using yt-dlp
        await youtubedl(url, {
            cookies: cookiesPath,   // Absolute path to cookies file
            extractorArgs: 'youtube:player_client=android', // Bypass bot block on data centers
            format: 'b',            // Suppress "best" warning
            jsRuntimes: 'node',     // Fix missing JS runtime warning
            output: outputPath,
            noCheckCertificates: true
        });
        
        console.log(`Download finished locally: ${outputPath}`);
        res.write(`Download finished on server. Starting upload to Google Drive...\n`);

        // 2. Upload to Google Drive
        const driveResponse = await uploadToDrive(outputPath, `YoutubeDownload_${videoId}.mp4`);
        console.log("Upload successful!", driveResponse);
        
        res.write(`\nSuccess! File uploaded to Google Drive.\nFile Link: ${driveResponse.webViewLink}\n`);
        res.end();

        // 3. Cleanup local file
        fs.unlinkSync(outputPath);
        
    } catch (error) {
        console.error("Error process:", error);
        res.write(`\nError occurred: ${error.message}\n`);
        res.end();
        
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Cloud Downloader Server running on port ${PORT}`);
});
