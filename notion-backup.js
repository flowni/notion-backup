#!/usr/bin/env node
/* eslint no-await-in-loop: 0 */

let axios = require('axios'),
  AWS = require('aws-sdk');
(extract = require('extract-zip')),
  ({ retry } = require('async')),
  ({
    createWriteStream,
    mkdirSync,
    rmdirSync,
    readFileSync,
    unlinkSync,
  } = require('fs')),
  ({ join } = require('path')),
  (notionAPI = 'https://www.notion.so/api/v3'),
  ({ NOTION_TOKEN, NOTION_SPACE_ID } = process.env),
  (client = axios.create({
    baseURL: notionAPI,
    headers: {
      Cookie: `token_v2=${NOTION_TOKEN}; file_token=${NOTION_FILE_TOKEN}`
    },
  })),
  (die = (str) => {
    console.error(str);
    process.exit(1);
  });

const currentDate = new Date();

function getTimestamp(currentDate) {
  let year = currentDate.getFullYear();
  let month = currentDate.getMonth() + 1;
  let day = currentDate.getDate();
  let hours = currentDate.getHours();
  let minutes = currentDate.getMinutes();

  month = month < 10 ? `0${month}` : month;
  day = day < 10 ? `0${day}` : day;
  hours = hours < 10 ? `0${hours}` : hours;
  minutes = minutes < 10 ? `0${minutes}` : minutes;

  return `${year}-${month}-${day}-${hours}-${minutes}`;
};

if (!NOTION_TOKEN || !NOTION_FILE_TOKEN || !NOTION_SPACE_ID) {
  die(`Need to have NOTION_TOKEN, NOTION_FILE_TOKEN and NOTION_SPACE_ID defined in the environment.
See https://github.com/darobin/notion-backup/blob/main/README.md for
a manual on how to get that information.`);
}

async function post(endpoint, data) {
  return client.post(endpoint, data);
}

async function sleep(seconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

// formats: markdown, html
async function exportFromNotion(format, currentTimeStampString) {
  try {
    let {
      data: { taskId },
    } = await post('enqueueTask', {
      task: {
        eventName: 'exportSpace',
        request: {
          spaceId: NOTION_SPACE_ID,
          exportOptions: {
            exportType: format,
            timeZone: 'America/New_York',
            locale: 'en',
          },
        },
      },
    });
    console.warn(`Enqueued task ${taskId}`);
    let failCount = 0,
      exportURL;
    while (true) {
      if (failCount >= 5) break;
      await sleep(10);
      let {
        data: { results: tasks },
      } = await retry({ times: 3, interval: 2000 }, async () =>
        post('getTasks', { taskIds: [taskId] })
      );
      let task = tasks.find((t) => t.id === taskId);
      // console.warn(JSON.stringify(task, null, 2)); // DBG
      if (!task) {
        failCount++;
        console.warn(`No task, waiting.`);
        continue;
      }
      if (!task.status) {
        failCount++;
        console.warn(
          `No task status, waiting. Task was:\n${JSON.stringify(task, null, 2)}`
        );
        continue;
      }
      if (task.state === 'in_progress')
        console.warn(`Pages exported: ${task.status.pagesExported}`);
      if (task.state === 'failure') {
        failCount++;
        console.warn(`Task error: ${task.error}`);
        continue;
      }
      if (task.state === 'success') {
        exportURL = task.status.exportURL;
        break;
      }
    }
    let res = await client({
      method: 'GET',
      url: exportURL,
      responseType: 'stream',
    });
    let stream = res.data.pipe(
      createWriteStream(
        join(process.cwd(), `${currentTimeStampString}-${format}.zip`)
      )
    );
    await new Promise((resolve, reject) => {
      stream.on('close', resolve);
      stream.on('error', reject);
    });
  } catch (err) {
    die(err);
  }
}

async function uploadFileToS3(fileName) {
  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const fileContent = readFileSync(fileName);
  const subFolderName = 'Notion/';

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `${subFolderName}${fileName}`,
    Body: fileContent,
  };

  s3.upload(params, function (err, data) {
    if (err) {
      throw err;
    }
    console.log(`File uploaded successfully. ${data.Location}`);
  });
}

async function run() {
  let cwd = process.cwd();
  const currentTimeStampString = getTimestamp(currentDate);
  console.log(`${currentTimeStampString} start script`);
  const fileNameMarkdown = `${currentTimeStampString}-markdown.zip`;
  const fileNameHtml = `${currentTimeStampString}-html.zip`;

  // export of notion markdown and html
  await exportFromNotion('markdown', currentTimeStampString);
  await exportFromNotion('html', currentTimeStampString);

  // upload to s3
  console.log('start uploading to AWS S3');
  uploadFileToS3(fileNameMarkdown);
  uploadFileToS3(fileNameHtml);
  console.log('uploaded');

  // delete files from PC
  unlinkSync(join(cwd, fileNameMarkdown));
  unlinkSync(join(cwd, fileNameHtml));
  console.log('removed files from disk');
  console.log('finished!');
}

run();
