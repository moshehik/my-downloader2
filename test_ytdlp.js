const youtubedl = require('youtube-dl-exec');
youtubedl('https://www.youtube.com/watch?v=nvyWXABq4ww', {
    extractorArgs: 'youtube:player_client=android',
    noCheckCertificates: true,
    output: 'test_local.mp4'
}).then(output => console.log('Success downloaded'))
  .catch(err => console.error('Error:', err.message));
