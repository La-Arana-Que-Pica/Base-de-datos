'use strict';

const path = require('path');

const projectRoot = path.resolve(
  process.env.LAQP_PROJECT_ROOT || path.join(__dirname, '..', '..'),
);

module.exports = { projectRoot };
