import { promises as Fs } from 'fs';
import * as Path from 'path';
import { OAuth2Client } from 'google-auth-library';
import { google as GoogleApis } from 'googleapis';
import { bug } from '../util/bug';

// adapted from https://developers.google.com/tasks/quickstart/nodejs

const SCOPES = ['https://www.googleapis.com/auth/tasks.readonly'];
const TOKEN_PATH = 'token.json';

// TODO(jaked) this must exist somewhere in googleapis
type Credentials = {
  installed: {
    client_id: string,
    project_id: string,
    auth_uri: string,
    token_uri: string,
    auth_provider_x509_cert_url: string,
    client_secret: string,
    redirect_uris: string[],
  }
}

export async function authAndSyncTaskLists(path: string) {
  const credentials = await Fs.readFile('credentials.json', 'utf8');
  authorize(JSON.parse(credentials), auth => syncTaskLists(auth, path));
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
async function authorize(credentials: Credentials, callback: (oauth2Client: OAuth2Client) => void) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new OAuth2Client(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  try {
    const token = await Fs.readFile(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  } catch {
    return getNewToken(oAuth2Client, callback);
  }
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
async function getNewToken(oAuth2Client: OAuth2Client, callback: (oAuth2Client: OAuth2Client) => void) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const code = '4/vAGwTjutDOfjIc0DAh8c8A8EX1-HKZA_OJIBeMbQsVnnL2Ai45LSpUE';
  const token = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(token.tokens);
  // Store the token to disk for later program executions
  // TODO(jaked) some biz with reissuing tokens
  await Fs.writeFile(TOKEN_PATH, JSON.stringify(token), 'utf8');
  callback(oAuth2Client);
}

async function syncTaskLists(auth: OAuth2Client, path: string) {
  const service = GoogleApis.tasks({version: 'v1', auth});
  const res = await service.tasklists.list();
  const taskLists = res.data.items;
  if (!taskLists) return;
  return Promise.all(taskLists.map(async (taskList) => {
    if (!taskList.id) return bug('expected taskList.id');
    const taskListPath = Path.resolve(path, taskList.id);
    await Fs.mkdir(taskListPath, { recursive: true });
    const tasks = await service.tasks.list({
      tasklist: taskList.id,
      showHidden: true,
      showDeleted: true,
    });
    if (!tasks.data.items) return;
    return Promise.all(tasks.data.items.map(async (task) => {
      if (!task.id) return bug('expected task.id');
      const taskPath = Path.resolve(taskListPath, task.id);
      return Fs.writeFile(taskPath, JSON.stringify(task, undefined, 2), 'utf8');
    }));
  }));
}
