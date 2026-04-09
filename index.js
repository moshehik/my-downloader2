const express = require('express');
const ytdl = require('@distube/ytdl-core');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send("השרת מוכן. השתמש בנתיב /watch?id=YOUR_ID");
});

app.get('/watch', async (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send('Missing ID');

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`מנסה להזרים סרטון: ${videoId}`);

    try {
        // הגדרות מתקדמות כדי "לעבוד" על יוטיוב
        const options = {
            filter: 'audioandvideo',
            quality: 'highest',
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            }
        };

        res.header('Content-Type', 'video/mp4');
        ytdl(url, options).pipe(res);

    } catch (e) {
        console.error("שגיאה קריטית:", e.message);
        res.status(500).send('השרת נתקל בקושי מול יוטיוב: ' + e.message);
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
