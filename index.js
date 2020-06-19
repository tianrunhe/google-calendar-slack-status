const express = require('express');
const bodyParser = require('body-parser');
const logger = require('morgan');
const emojiRegex = require('emoji-regex');
const nodeEmoji = require('node-emoji');
const slack = require('slack');
const moment = require('moment-timezone');

const app = express();
const port = process.env.PORT || 5000;

app.use(logger('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const router = express.Router();

const default_setting = {
  'emoji': nodeEmoji.unemojify('🗓'),
  'dnd': true,
  'away': false
}

const setting_map = {
  'Focus Time': {
    'emoji': nodeEmoji.unemojify('💻'),
    'dnd': true,
    'away': false
  },
  'Lunch': {
    'emoji': nodeEmoji.unemojify('🍽'),
    'dnd': false,
    'away': true
  },
  'Exercise': {
    'emoji': nodeEmoji.unemojify('💪'),
    'dnd': false,
    'away': true
  },
  'Take a walk': {
    'emoji': nodeEmoji.unemojify('☀️'),
    'dnd': false,
    'away': true
  },
  'Take a nap': {
    'emoji': nodeEmoji.unemojify('💤'),
    'dnd': false,
    'away': true
  },
  'Travel': {
    'emoji': nodeEmoji.unemojify('🚌'),
    'dnd': false,
    'away': true
  },
  'Personal Commitment': {
    'emoji': nodeEmoji.unemojify('🏠'),
    'dnd': false,
    'away': true
  }
}

async function setStatus(token, profile, status, end) {
  await slack.users.profile
    .set({ token, profile })
    .then(console.log(`Status set as "${status}" and will expire at ${end.format('HH:mm')} UTC`))
    .catch(function handleErrors(e) {
      console.error(e);
    });
}

app.post('/', (req, res, next) => {
  // check for secret token
  if (!req.body.token || req.body.token !== process.env.SECRET_TOKEN) {
    next();
    return;
  }
  // store token
  const token = process.env.SLACK_TOKEN;
  // log some stuff for dev
  console.log(req.body);
  // grab status and emojis and clean it up
  let status = req.body.title;

  // parse event start/stop time
  const dateFormat = 'MMM D, YYYY [at] hh:mmA';
  const start = moment.tz(req.body.start, dateFormat, `${process.env.TIME_ZONE}`);
  if (end.hour() < 9) {
    console.log(`Event '${status}' ends at ${end}, which is before 09:00 ${process.env.TIME_ZONE}, ignoring...`)
    res.status(200)
    res.send('Too early(!')
    return
  } else if (start.hour() > 17) {
    console.log(`Event '${status}' starts at ${start}, which is after 17:00 ${process.env.TIME_ZONE}, ignoring...`)
    res.status(200)
    res.send('Too late!')
    return
  }
  const end = moment.tz(req.body.end, dateFormat, `${process.env.TIME_ZONE}`);

  let matched = false
  for (title_keyword in setting_map) {
    if (!matched && status.includes(title_keyword)) {
      matched = true
      setting = setting_map[title_keyword]
      if (setting['dnd']) {
        slack.dnd.setSnooze({
          token,
          num_minutes: end.diff(start, 'minutes')
        }); 
      }
 
      if (setting['away']) {
        slack.users.setPresence({
          token,
          presence: 'away'
        });
      }

      statusEmoji = setting['emoji']
      status = title_keyword
    }
  }

  if (!matched) {
    setting = default_setting
    slack.dnd.setSnooze({
      token,
      num_minutes: end.diff(start, 'minutes')
    }); 
    statusEmoji = setting['emoji']
  }

  // set status
  status = `${status} till ${end.format('HH:mm')} ${process.env.TIME_ZONE}`;
  let profile = JSON.stringify({
    "status_text": status,
    "status_emoji": statusEmoji,
    "status_expiration": end.utc().unix()
  });
  console.log(profile);
  setStatus(token, profile, status, end)
  res.status(200);
  res.send('🤘');
});

app.get('/', (req, res, next) => {
  // welcome message
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome!</title>
        <style>
          pre {
            background-color: #DDD;
            padding: 1em;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <h1>Your Heroku server is running!</h1>
        <p>You'll need the following information for your IFTTT recipe:</p>
        <h3>Body</h3>
<pre>{
  "title":"<<<{{Title}}>>>",
  "start":"{{Starts}}",
  "end":"{{Ends}}",
  "token": "${process.env.SECRET_TOKEN}"
}</pre>
      </body>
    </html>
  `);
});

app.use((req, res, next) => {
  res.status(404);
  res.send('Not found');
});

app.listen(port);
console.log(`Server running on port ${port}`);
