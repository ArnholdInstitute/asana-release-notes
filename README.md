# Asana Release Notes Generator
Generates release notes for Asana tasks with a given version number.

Version numbers should be added to Asana tasks via tags in the form `v{version#}` (ex. `v1.5.0`).  To start a release, run the command `yarn release` or `yarn release -v {version#} -t {type}`.  If no command line arguments are provided, you will be prompted for them.  The release notes will be copied to the releases directory.  Be sure to create a .env file with the `ASANA_ACCESS_TOKEN`, `ASANA_API_VERSION`, and `ASANA_PROJECT_ID` properties.
