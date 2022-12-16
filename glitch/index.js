const { App } = require("@slack/bolt");
const store = require("./store");
const https = require("https");

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

app.event("message", ({ event, say }) => {
  const res = event.text;
  const user = event.user;
  if (res[0].indexOf("#") == -1) {
    const data = JSON.stringify({
      user: user,
      body: res,
    });
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };
    const request = https.request(process.env.GAS_URL, options);
    request.write(data);
    request.end();
  }
});

// Start your app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ Bolt app is running!");
})();
