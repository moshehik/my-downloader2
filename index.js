const express = require('express');
const ytdl = require('@distube/ytdl-core');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/watch', async (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send('Missing ID');

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    try {
        res.header('Content-Type', 'video/mp4');
        // השרת החיצוני פונה ליוטיוב ומזרים אליך
        ytdl(url, { 
            filter: 'audioandvideo', 
            quality: 'highest' 
        }).pipe(res);
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
