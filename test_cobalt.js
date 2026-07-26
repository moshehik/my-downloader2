const https = require('https');

const data = JSON.stringify({
    url: 'https://www.youtube.com/watch?v=nvyWXABq4ww',
    vCodec: 'h264'
});

const options = {
    hostname: 'api.cobalt.tools',
    path: '/',
    method: 'POST',
    rejectUnauthorized: false,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, res => {
    let response = '';
    res.on('data', chunk => response += chunk);
    res.on('end', () => console.log(response));
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
