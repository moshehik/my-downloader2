const express = require('express');
const ytdl = require('@distube/ytdl-core');
const app = express();
const PORT = process.env.PORT || 10000; // שינוי לפורט של Render

app.get('/', (req, res) => {
    res.send("השרת פועל! נסה להוסיף /watch?id=aqz-KE-bpKQ לשורת הכתובת.");
});

app.get('/watch', async (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send('Missing ID');

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`--- מנסה להזרים: ${videoId} ---`);

    try {
        // בדיקה אם הסרטון קיים לפני שמתחילים להזרים
        const info = await ytdl.getInfo(url);
        
        res.header('Content-Type', 'video/mp4');
        
        // הזרמה עם הגדרות אבטחה
        const stream = ytdl.downloadFromInfo(info, {
            filter: 'audioandvideo',
            quality: 'highest'
        });

        stream.pipe(res);

        stream.on('error', (err) => {
            console.error("שגיאה בזמן ההזרמה:", err.message);
            if (!res.headersSent) res.status(500).send("ההזרמה נפסקה.");
        });

    } catch (e) {
        console.error("שגיאה בשליפת המידע:", e.message);
        // אם יוטיוב חוסם, נראה את זה כאן
        res.status(500).send(`שגיאה מיוטיוב: ${e.message}`);
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
