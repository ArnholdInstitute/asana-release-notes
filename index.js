const chalk = require('chalk');
const csv = require('csvtojson');
const fetch = require('node-fetch');
const fs = require('fs');
const marked = require('marked');
const pdf = require('html-pdf');
const prompt = require('prompt');
const { promisify } = require('util');
const { wrapBody } = require('./template');

// use some async stuff where possible
const writeFile = promisify(fs.writeFile);
const toHTML = promisify(marked);

// load in environment variables
require('dotenv').config()
const { ASANA_ACCESS_TOKEN, ASANA_API_VERSION, ASANA_PROJECT_ID } = process.env;
if (!(ASANA_ACCESS_TOKEN && ASANA_API_VERSION && ASANA_PROJECT_ID)) {
  console.log(`${chalk.red('error')}:   The .env file incomplete.  Make sure it includes ASANA_ACCESS_TOKEN, ASANA_API_VERSION and ASANA_PROJECT_ID.`);
  return;
}
const ASANA_API_URL = `https://app.asana.com/api/${ASANA_API_VERSION}`;
const ASANA_PROJECT_URL=`https://app.asana.com/0/${ASANA_PROJECT_ID}`;

// consistently format error messages
const logError = msg => console.log(`${chalk.red('error')}:   ${msg}`);

// gets the Asana tagId for a given version tag
const getTagId = async (tag) => {
  let tagId;
  console.log(chalk.yellow('Resolving version tag id...'));

  try {
    const headers = new fetch.Headers({ Authorization: `Bearer ${ASANA_ACCESS_TOKEN}` });
    const response = await fetch(`${ASANA_API_URL}/tags`, { headers });
    if (response.ok) {
      const { data } = await response.json();
      data.forEach(({ id, name }) => {
        if (name === tag) {
          tagId = id;
        }
      });
    }
  } catch (err) {
    logError('An error occurred while resolving the version tag id.');
  }

  if (!tagId) {
    logError(`The tag ${tag} was not found.`);
  }
  return tagId;
};

// gets all tasks that have a given tagId
const getTasks = async (tagId) => {
  let data;
  console.log(chalk.yellow('Searching for tasks...'));

  try {
    const headers = new fetch.Headers({ Authorization: `Bearer ${ASANA_ACCESS_TOKEN}` });
    // additional fields can be returned with the opt_fields parameter
    const response = await fetch(`${ASANA_API_URL}/tasks?tag=${tagId}&opt_fields=id,name,projects`, { headers });
    if (response.ok) {
      ({ data } = await response.json());
    }
  } catch (err) {
    logError('An error occurred while searching for tasks.');
  }
  // filter out any tasks that don't belong to the defined project
  return data.filter(o => !!o.projects.find(oo => `${oo.id}` === ASANA_PROJECT_ID));
};

// generates the release notes and calls the functions to write out the files
const genNotes = async (version, tasks = []) => {
  const text =
  `# Version ${version} Release Notes
  Tasks may be viewed directly on Asana by clicking on their taskId
  &nbsp;
  ##### Items completed:
  ${tasks.sort(({ id: a }, { id: b }) => a > b ? 1 : (a < b ? -1 : 0))
    .map(({ id, name }) => (
      `* [\`${id}\`](${ASANA_PROJECT_URL}/${id}) - ${name}`
    )).join('\n')}
  `.replace(/ {2,}/g, ''); // replace groups of 2 or more spaces with an empty string for proper formatting
  const htmlBody = await toHTML(text.replace(/&nbsp;/g, '<br><br>'));  // generate an html body from the text

  // write the text directory into the markdown file
  writeMD(version, text);
  // write the html file
  writeHTML(version, htmlBody);
  // write the pdf file
  writePDF(version, htmlBody);
}

// write the markdown file out to the releases directory
const writeMD = async (version, text) => {
  try {
    await writeFile(`./releases/v${version}.md`, text);
    console.log(chalk.green(`Release notes written to ./releases/v${version}.md`));
  } catch (err) {
    logError(`An error occurred while writing ./releases/v${version}.md`);
  }
};

// write the html file out to the releases directory
const writeHTML = async (version, body) => {
  const html = wrapBody(body, 16);
  try {
    await writeFile(`./releases/v${version}.html`, html);
    console.log(chalk.green(`Release notes written to ./releases/v${version}.html`));
  } catch (err) {
    logError(`An error occurred while writing ./releases/v${version}.html`);
  }
};

// write the pdf file out to the releases directory
const writePDF = (version, body) => {
  const html = wrapBody(body, 10);
  pdf.create(html, {
    border: {
      top: "0.25in",
      right: "0.5in",
      bottom: "0.25in",
      left: "0.5in"
    },
  }).toFile(`./releases/v${version}.pdf`, (err) => {
    if (err) {
      logError(`An error occurred while writing ./releases/v${version}.pdf`);
      return;
    }
    console.log(chalk.green(`Release notes written to ./releases/v${version}.pdf`));
  });
};

// prompt the user for a version string
const argVersion = process.argv[2];
if (argVersion) {
  prompt.override = { version: argVersion };
}

prompt.message = '';
prompt.delimiter = '';

prompt.start();
prompt.get([{
  name: 'version',
  type: 'string',
  description: chalk.green('Enter the version number (ex. 1.0.0):'),
  pattern: /^\d+\.\d+\.\d+$/,
  message: 'The version must be in the format x.x.x',
  required: true,
}], async (err, result) => {
  if (result) {
    const { version } = result;
    const tagId = await getTagId(`v${version}`);
    if (tagId) {
      const tasks = await getTasks(tagId);
      genNotes(version, tasks);
    }
  }
});
