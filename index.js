const prompt = require('prompt');
const csv = require('csvtojson');
const fs = require('fs');

prompt.start();

prompt.get([{
  name: 'version',
  type: 'string',
  description: 'Enter the version number (ex. 1.0.0)',
  pattern: /^\d+\.\d+\.\d+$/,
  message: 'The version must be in the format x.x.x',
  required: true,
}], (err, { version }) => {
  if (err) throw err;

  const items = [];
  csv().fromFile(`./releases/v${version.replace(/\./g, '')}.csv`)
    .on('json', ({ 'Task ID': taskId, Name: name }) => {
      items.push({ taskId, name });
    })
    .on('done', (err) => {
      if (err) throw err;

      // generate the release document
      const notes =
      `# Version ${version} Release Notes
      Tasks may be viewed directly on Asana by clicking on the task ID link
      &nbsp;
      ##### Items completed:
      ${items.sort(({ taskId: a }, { taskId: b }) => a > b ? 1 : (a < b ? -1 : 0))
        .map(({ taskId, name }) => (
          `* [\`${taskId}\`](https://app.asana.com/0/430541393561890/${taskId}) - ${name}`
        )).join('\n')}
      `.replace(/ {2,}/g, ''); // replace groups of 2 or more spaces with an empty string for proper formatting

      // write the file out to the releases directory
      fs.writeFile(`./releases/v${version}.md`, notes, (err) => {
        if (err) throw err;
      })
    });
});
