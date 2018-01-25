const chalk = require('chalk');
const fetch = require('node-fetch');
const fs = require('fs');
const htmlPdf = require('html-pdf-chrome');
const minimist = require('minimist');
const mkdirp = require('mkdirp');
const moment = require('moment');
const prompt = require('prompt');
const { promisify } = require('util');
const { wrapBody } = require('./template');

// use async stuff where possible
const mkdir = promisify(mkdirp);
const writeFile = promisify(fs.writeFile);

// consistently format error messages
const logError = msg => console.log(`${chalk.red('error')}:   ${msg}`);

// load in environment variables
require('dotenv').config()
const { ASANA_ACCESS_TOKEN, ASANA_API_VERSION, ASANA_PROJECT_ID } = process.env;
if (!(ASANA_ACCESS_TOKEN && ASANA_API_VERSION && ASANA_PROJECT_ID)) {
  const errorMsg = 'The .env file incomplete.  ' +
    'Make sure it includes ASANA_ACCESS_TOKEN, ASANA_API_VERSION, and ASANA_PROJECT_ID.'
  logError(errorMsg);
  return;
}
const ASANA_API_URL = `https://app.asana.com/api/${ASANA_API_VERSION}`;
const ASANA_PROJECT_URL=`https://app.asana.com/0/${ASANA_PROJECT_ID}`;

// utility function for making rest api calls
const callAPI = async ({
  body,
  errorMsg = 'An error has occurred',
  headers,
  method = 'GET',
  parser = 'json',
  url,
} = {}) => {
  let data;
  try {
    // apply options for the call
    const opts = { method };
    if (headers) { opts.headers = new fetch.Headers(headers); }
    if (body) { opts.body = body; }

    // make the call
    response = await fetch(url, opts);
    if (response.ok) {
      data = await response[parser]();
    } else {
      logError(`${errorMsg} - ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    logError(errorMsg);
    console.log(err);
  }
  return data;
};

// gets the Asana tagId for a given version tag
const getTagId = async (tag) => {
  console.log(chalk.yellow('Resolving version tag id...'));
  const { data } = await callAPI({
    url: `${ASANA_API_URL}/tags`,
    headers: { Authorization: `Bearer ${ASANA_ACCESS_TOKEN}` },
    errorMsg: 'An error occurred while resolving the version tag id',
  });

  // parse the data to find the tagId
  let tagId;
  if (data && data.length) {
    data.forEach(({ id, name }) => {
      if (name === tag) {
        tagId = id;
      }
    });
    if (!tagId) { logError(`The tag ${tag} was not found`); }
  }
  return tagId;
};

// gets all tasks that have a given tagId
const getTasks = async (tagId) => {
  console.log(chalk.yellow('Searching for tasks...'));
  const { data } = await callAPI({
    url: `${ASANA_API_URL}/tasks?tag=${tagId}&opt_fields=id,name,projects`,
    headers: { Authorization: `Bearer ${ASANA_ACCESS_TOKEN}` },
    errorMsg: 'An error occurred while searching for tasks',
  }) || [];

  // filter out any tasks that don't belong to the defined project
  return data.filter(o => !!o.projects.find(oo => `${oo.id}` === ASANA_PROJECT_ID));
};

// render the markdown using the GitHub api
const render = async (text) => {
  console.log(chalk.yellow('Rendering markdown...'));
  return await callAPI({
    url: 'https://api.github.com/markdown',
    errorMsg: 'An error occurred while rendering the markdown as HTML',
    method: 'POST',
    body: JSON.stringify({
      text: text,
      mode: 'gfm',
    }),
    parser: 'text',
  });
};

// generates the release notes and calls the functions to write out the files
const genNotes = async (version, type, tasks = []) => {
  const dir = `./releases/v${version}`;
  const filePath = `${dir}/v${version}`;
  const text = createContent(version, type, tasks);

  // make a subdirectory for this release
  try {
    await mkdir(dir);
  } catch (err) {
    logError('An error occurred while creating the version directory');
    console.log(err);
    return;
  }

  writeMD(filePath, text); // write the md file

  // only write the html and pdf files if rendering was successful.
  const htmlBody = await render(text);  // generate an html body from the text
  if (htmlBody) {
    writeHTML(filePath, htmlBody); // write the html file
    writePDF(filePath, htmlBody); // write the pdf file
  }
};

// creates the content for the release notes
const createContent = (version, type, tasks) => {
  const now = moment();
  return `# ATLAS ${version} Release Notes
  _Tasks may be viewed directly on Asana by clicking their taskId_
  &nbsp;
  ##### Release Type:
  - [${type === 'major' ? 'x' : ' '}] Major
  - [${type === 'minor' ? 'x' : ' '}] Minor
  - [${type === 'patch' ? 'x' : ' '}] Patch
  &nbsp;
  ##### Items completed:
  ${tasks.sort(({ id: a }, { id: b }) => a > b ? 1 : (a < b ? -1 : 0))
    .map(({ id, name }) => (
      `* [\`${id}\`](${ASANA_PROJECT_URL}/${id}) - ${name}`
  )).join('\n')} \n
  &nbsp;
  _Generated ${now.format('MM/DD/YYYY')} at ${now.format('hh:mm A')}_
  `.replace(/ {2,}/g, ''); // replace groups of 2 or more spaces with an empty string for proper formatting
};

// write the markdown file out to the releases directory
const writeMD = async (filePath, text) => {
  try {
    await writeFile(`${filePath}.md`, text);
    console.log(chalk.green(`Markdown file written successfully`));
  } catch (err) {
    logError(`An error occurred while writing the markdown file`);
    console.log(err);
  }
};

// write the html file out to the releases directory
const writeHTML = async (filePath, body) => {
  const html = wrapBody(body, 16);
  try {
    await writeFile(`${filePath}.html`, html);
    console.log(chalk.green(`HTML file written successfully`));
  } catch (err) {
    logError(`An error occurred while writing the HTML file`);
    console.log(err);
  }
};

// write the pdf file out to the releases directory
const writePDF = async (filePath, body) => {
  const html = wrapBody(body, 12);
  try {
    const pdf = await htmlPdf.create(html, {
      border: {
        top: "0.25in",
        right: "0.5in",
        bottom: "0.25in",
        left: "0.5in"
      },
    });
    await pdf.toFile(`${filePath}.pdf`);
    console.log(chalk.green(`PDF file written successfully`));
  } catch (err) {
    logError(`An error occurred while writing the PDF file`);
    console.log(err);
  }
};

// prompt the user for a version string
const argv = minimist(process.argv.slice(2));
prompt.override = { version: argv.v, type: argv.t };

prompt.message = '';
prompt.delimiter = '';

prompt.start();
prompt.get([
  {
    name: 'version',
    type: 'string',
    description: chalk.magenta('Enter the version number (ex. 1.0.0):'),
    pattern: /^\d+\.\d+\.\d+$/,
    message: 'The version must be in the format x.x.x',
    required: true,
  },
  {
    name: 'type',
    type: 'string',
    description: chalk.magenta('Enter the release type (major|minor|patch):'),
    pattern: /^major$|^minor$|^patch$/i,
    message: 'You must enter a valid release type',
    required: true,
  }
], async (err, result) => {
  if (result) {
    const { version, type } = result;
    const tagId = await getTagId(`v${version}`);
    if (tagId) {
      const tasks = await getTasks(tagId);
      genNotes(version, type.toLowerCase(), tasks);
    }
  }
});
