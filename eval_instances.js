const axios = require('axios');
axios.post('https://my-downloader2.onrender.com/eval', {
    code: `
        const { execSync } = require('child_process');
        const fs = require('fs');
        fs.writeFileSync('test.txt', 'hello');
        try {
            const out = execSync('zip -P 1234 -0j test.zip test.txt', { timeout: 5000 }).toString();
            return out;
        } catch(e) {
            return e.message;
        }
    `
}).then(res => console.log(JSON.stringify(res.data, null, 2)))
  .catch(err => console.error(err));
