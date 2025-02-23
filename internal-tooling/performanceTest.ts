/*!
 * Copyright 2022 Google LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {appendFile} from 'fs/promises';
// eslint-disable-next-line node/no-unsupported-features/node-builtins
import {Worker} from 'worker_threads';
import yargs = require('yargs');
import {TestResult} from './performanceUtils';
import {existsSync} from 'fs';
import {writeFile} from 'fs/promises';

const DEFAULT_ITERATIONS = 100;
const DEFAULT_THREADS = 1;
const CSV_HEADERS =
  'Op,ObjectSize,AppBufferSize,LibBufferSize,Crc32cEnabled,MD5Enabled,ApiName,ElapsedTimeUs,CpuTimeUs,Status\n';
const START_TIME = Date.now();
export const enum TRANSFER_MANAGER_TEST_TYPES {
  WRITE_ONE_READ_THREE = 'w1r3',
  TRANSFER_MANAGER_UPLOAD_MANY_FILES = 'tm-upload',
  TRANSFER_MANAGER_DOWNLOAD_MANY_FILES = 'tm-download',
  TRANSFER_MANAGER_CHUNKED_FILE_DOWNLOAD = 'tm-chunked',
  APPLICATION_LARGE_FILE_DOWNLOAD = 'application-large',
  APPLICATION_UPLOAD_MULTIPLE_OBJECTS = 'application-upload',
  APPLICATION_DOWNLOAD_MULTIPLE_OBJECTS = 'application-download',
}

const argv = yargs(process.argv.slice(2))
  .options({
    iterations: {type: 'number', default: DEFAULT_ITERATIONS},
    numthreads: {type: 'number', default: DEFAULT_THREADS},
    testtype: {
      type: 'string',
      choices: [
        TRANSFER_MANAGER_TEST_TYPES.WRITE_ONE_READ_THREE,
        TRANSFER_MANAGER_TEST_TYPES.TRANSFER_MANAGER_UPLOAD_MANY_FILES,
        TRANSFER_MANAGER_TEST_TYPES.TRANSFER_MANAGER_DOWNLOAD_MANY_FILES,
        TRANSFER_MANAGER_TEST_TYPES.TRANSFER_MANAGER_CHUNKED_FILE_DOWNLOAD,
        TRANSFER_MANAGER_TEST_TYPES.APPLICATION_DOWNLOAD_MULTIPLE_OBJECTS,
        TRANSFER_MANAGER_TEST_TYPES.APPLICATION_LARGE_FILE_DOWNLOAD,
        TRANSFER_MANAGER_TEST_TYPES.APPLICATION_UPLOAD_MULTIPLE_OBJECTS,
      ],
      default: TRANSFER_MANAGER_TEST_TYPES.WRITE_ONE_READ_THREE,
    },
  })
  .parseSync();

let iterationsRemaining = argv.iterations;

/**
 * Main entry point for performing a Write 1 Read 3 performance measurement test.
 * This function will create the number of threads supplied in the numthreads argument or
 * default to 1 if no argument is provided. The test will be run for the number of iterations
 * specified by the iterations parameter or 100 if not specified.
 */
function main() {
  let numThreads = argv.numthreads;
  if (numThreads > iterationsRemaining) {
    console.log(
      `${numThreads} is greater than number of iterations (${iterationsRemaining}). Using ${iterationsRemaining} threads instead.`
    );
    numThreads = iterationsRemaining;
  }
  if (argv.testtype !== TRANSFER_MANAGER_TEST_TYPES.WRITE_ONE_READ_THREE) {
    numThreads = 1;
  }
  for (let i = 0; i < numThreads; i++) {
    createWorker();
  }
}

/**
 * Creates a new worker thread and performs a test iteration in that worker.
 * When the worker passes back the results, they are appended to the results file.
 */
function createWorker() {
  iterationsRemaining--;
  console.log(
    `Starting new iteration. Current iterations remaining: ${iterationsRemaining}`
  );
  let testPath = '';
  if (argv.testtype === TRANSFER_MANAGER_TEST_TYPES.WRITE_ONE_READ_THREE) {
    testPath = `${__dirname}/performPerformanceTest.js`;
  } else if (
    argv.testtype ===
      TRANSFER_MANAGER_TEST_TYPES.TRANSFER_MANAGER_UPLOAD_MANY_FILES ||
    argv.testtype ===
      TRANSFER_MANAGER_TEST_TYPES.TRANSFER_MANAGER_CHUNKED_FILE_DOWNLOAD ||
    argv.testtype ===
      TRANSFER_MANAGER_TEST_TYPES.TRANSFER_MANAGER_DOWNLOAD_MANY_FILES
  ) {
    testPath = `${__dirname}/performTransferManagerTest.js`;
  } else if (
    argv.testtype ===
      TRANSFER_MANAGER_TEST_TYPES.APPLICATION_UPLOAD_MULTIPLE_OBJECTS ||
    argv.testtype ===
      TRANSFER_MANAGER_TEST_TYPES.APPLICATION_LARGE_FILE_DOWNLOAD ||
    argv.testtype ===
      TRANSFER_MANAGER_TEST_TYPES.APPLICATION_DOWNLOAD_MULTIPLE_OBJECTS
  ) {
    testPath = `${__dirname}/performApplicationPerformanceTest.js`;
  }

  const w = new Worker(testPath, {
    argv: process.argv.slice(2),
  });

  w.on('message', data => {
    console.log('Successfully completed iteration.');
    appendResultToCSV(data);
    if (iterationsRemaining > 0) {
      createWorker();
    }
  });
  w.on('error', e => {
    console.log('An error occurred.');
    console.log(e);
  });
}

/**
 * Appends the test results to the CSV file.
 *
 * @param {TestResult[]} results
 */
async function appendResultToCSV(results: TestResult[] | TestResult) {
  const fileName = `nodejs-perf-metrics-${START_TIME}-${argv.iterations}.csv`;
  const resultsToAppend: TestResult[] = Array.isArray(results)
    ? results
    : [results];

  if (!existsSync(fileName)) {
    await writeFile(fileName, CSV_HEADERS);
  }
  const csv = resultsToAppend.map(result => Object.values(result));
  const csvString = csv.join('\n');
  await appendFile(fileName, `${csvString}\n`);
}

main();
