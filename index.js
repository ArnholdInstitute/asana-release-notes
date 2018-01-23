const prompt = require('prompt');
const csv = require('csvtojson');
const chalk = require('chalk');
const fs = require('fs');

const ASANA_BASE_URL = 'https://app.asana.com/0/430541393561890';
const VALIDATOR = /^\d+\.\d+\.\d+$/;
const VALIDATION_MSG = 'The version must be in the format x.x.x';

// function to convert the csv to md
const release = (version) => {
  const items = [];
  csv().fromFile(`./releases/v${version.replace(/\./g, '')}.csv`)
    .on('json', ({ 'Task ID': taskId, Name: name }) => {
      items.push({ taskId, name });
    })
    .on('done', (err) => {
      if (err) {
        if (err.message === 'File not exists') {
          console.log(`${chalk.red('error')}:   CSV export for version ${version} not found.`);
          return;
        }
        throw err;
      }

      // generate the release document
      const notes =
      `# Version ${version} Release Notes
      Tasks may be viewed directly on Asana by clicking on their taskId
      &nbsp;
      ##### Items completed:
      ${items.sort(({ taskId: a }, { taskId: b }) => a > b ? 1 : (a < b ? -1 : 0))
        .map(({ taskId, name }) => (
          `* [\`${taskId}\`](${ASANA_BASE_URL}/${taskId}) - ${name}`
        )).join('\n')}
      `.replace(/ {2,}/g, ''); // replace groups of 2 or more spaces with an empty string for proper formatting

      // write the file out to the releases directory
      fs.writeFile(`./releases/v${version}.md`, notes, (err) => {
        if (err) throw err;
      })
    });
};

// prompt the user for a version string
const version = process.argv[2];
if (version) {
  prompt.override = { version };
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
}], (err, result) => {
  if (result && result.version) {
    release(result.version);
  }
});
