'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const formula = require(path.join(projectRoot, 'js', 'pes2018-overall.js'));
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));

const results = cases.map(testCase => {
  if (testCase.row) {
    return formula.overallFromLaqpRow(testCase.row, testCase.target || undefined);
  }
  return formula.pes2018Overall(
    testCase.stats,
    testCase.target,
    testCase.natural || testCase.target,
    testCase.familiarity || 0,
  );
});

process.stdout.write(JSON.stringify(results));
