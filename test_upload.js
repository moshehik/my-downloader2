const fs = require('fs');
const http = require('http');
const https = require('https');

const cookies = fs.readFileSync('cookies.txt', 'utf8');

const data = JSON.stringify({ cookies: cookies });

const options = {
  hostname: 'my-downloader2.onrender.com',
  port: 443,
  path: '/update-cookies',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
