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

app.get('/', (req, res) => {
    res.send("שרת ההורדות בענן פועל! הוסף /download?id=VIDEO_ID כדי להוריד.");
});

// Authentication for Google Drive
async function getDriveService() {
    const credsPath = path.join(__dirname, 'credentials.json');
    if (!fs.existsSync(credsPath)) {
        throw new Error("Missing credentials.json for Google Drive API.");
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: credsPath,
        scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    return google.drive({ version: 'v3', auth });
}

async function uploadToDrive(filePath, fileName) {
    const drive = await getDriveService();
    const folderId = process.env.DRIVE_FOLDER_ID; // The folder ID in user's Drive

    const fileMetadata = {
        name: fileName,
        parents: folderId ? [folderId] : undefined
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
        // Send initial response so Render doesn't timeout
        res.write(`Starting background download for video ${videoId}...\n`);
        
        // 1. Download Video using yt-dlp via youtube-dl-exec
        await youtubedl(url, {
            cookies: 'cookies.txt', // Use the provided cookies file
            format: 'best',         // Best pre-merged format to avoid ffmpeg merging issues on server
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
        
        // Cleanup on error
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Cloud Downloader Server running on port ${PORT}`);
});
