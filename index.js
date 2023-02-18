const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
let myLabel;

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }

  return client;
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listLabels(auth) {
  const gmail = google.gmail({version: 'v1', auth});
  const res = await gmail.users.labels.list({
    userId: 'me',
  });
  const labels = res.data.labels;
  if (!labels || labels.length === 0) {
    console.log('No labels found.');
    return;
  }
  console.log('Labels:');
  labels.forEach((label) => {
    if(label.name === "IMPORTANT"){
        myLabel = label;
    }
    console.log(label.id);
  });

  fetchEmails();

}



async function fetchEmails(auth) {
    const gmail = google.gmail({ version: 'v1', auth: auth });
    const res = await gmail.users.messages.list({ userId: 'me' });
    const messages = res.data.messages || [];
    console.log(messages);

    const noReplyMessages = [];

    for (let i = 0; i < messages.length-90; i++) {
      const message = messages[i];
      const messageDetails = await gmail.users.messages.get({ userId: 'me', id: message.id });
      console.log(messageDetails);
      if (!messageDetails.data.threadId) {
        noReplyMessages.push(messageDetails);
        sendReply(message.id, messageDetails);
        tagSentEmail(message.id, myLabel);
      }
    }

}

async function sendReply(messageId, messageDetails) {
    const from = messageDetails.payload.headers.find(header => header.name === 'From').value;
    const to = messageDetails.payload.headers.find(header => header.name === 'To').value;
    const subject = messageDetails.payload.headers.find(header => header.name === 'Subject').value;
    const body = 'Hello, this is an automated reply.';
    const threadId = messageDetails.threadId;
  
    const reply = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        threadId: threadId,
        raw: createMessage(from, to, subject, body)
      }
    });
    console.log(`Sent reply to message ${messageId}: ${reply.data.id}`);


  }
  
  function createMessage(from, to, subject, body) {
    const message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Thread-Id: ${threadId}`,
      '',
      `${body}`
    ].join('\n');
  
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
}

async function tagSentEmail(messageId, label) {
    const res = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [label]
      }
    });
    console.log(`Tagged email with label ${label}: ${messageId}`);
}

authorize().then(listLabels).catch(console.error);
