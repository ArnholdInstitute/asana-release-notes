// yup, tons of dependencies.  It's a command line tool, I don't care.
const chalk = require('chalk');
const csv = require('csvtojson');
const fetch = require('node-fetch');
const fs = require('fs');
const marked = require('marked');
const mkdirp = require('mkdirp');
const moment = require('moment');
const pdf = require('html-pdf');
const prompt = require('prompt');
const { promisify } = require('util');
const { wrapBody } = require('./template');

// use some async stuff where possible
const mkdir = promisify(mkdirp);
const toHTML = promisify(marked);
const writeFile = promisify(fs.writeFile);

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
    logError('An error occurred while resolving the version tag id');
  }

  if (!tagId) {
    logError(`The tag ${tag} was not found`);
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
    logError('An error occurred while searching for tasks');
  }
  // filter out any tasks that don't belong to the defined project
  return data.filter(o => !!o.projects.find(oo => `${oo.id}` === ASANA_PROJECT_ID));
};

// generates the release notes and calls the functions to write out the files
const genNotes = async (version, tasks = []) => {
  const now = moment();
  const text =
  `# Version ${version} Release Notes
  _Tasks may be viewed directly on Asana by clicking their taskId_
  &nbsp;
  ##### Items completed:
  ${tasks.sort(({ id: a }, { id: b }) => a > b ? 1 : (a < b ? -1 : 0))
    .map(({ id, name }) => (
      `* [\`${id}\`](${ASANA_PROJECT_URL}/${id}) - ${name}`
  )).join('\n')}

  &nbsp;
  _Generated ${now.format('MM/DD/YYYY')} at ${now.format('hh:mm A')}_
  `.replace(/ {2,}/g, ''); // replace groups of 2 or more spaces with an empty string for proper formatting

  const htmlBody = await toHTML(text.replace(/&nbsp;/g, '<br><br>'));  // generate an html body from the text
  const dir = `./releases/v${version}`;
  const filePath = `${dir}/v${version}`;

  try {
    await mkdir(dir);
  } catch (err) {
    logError('An error occurred while creating the version directory');
    return;
  }

  // write the text directory into the markdown file
  writeMD(filePath, text);
  // write the html file
  writeHTML(filePath, htmlBody);
  // write the pdf file
  writePDF(filePath, htmlBody);
}

// write the markdown file out to the releases directory
const writeMD = async (filePath, text) => {
  try {
    await writeFile(`${filePath}.md`, text);
    console.log(chalk.green(`Markdown file written successfully`));
  } catch (err) {
    logError(`An error occurred while writing the markdown file`);
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
  }
};

// write the pdf file out to the releases directory
const writePDF = (filePath, body) => {
  const html = wrapBody(body, 10);
  pdf.create(html, {
    border: {
      top: "0.25in",
      right: "0.5in",
      bottom: "0.25in",
      left: "0.5in"
    },
  }).toFile(`${filePath}.pdf`, (err) => {
    if (err) {
      logError(`An error occurred while writing the PDF file`);
      return;
    }
    console.log(chalk.green(`PDF file written successfully`));
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
