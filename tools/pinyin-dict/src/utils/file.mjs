import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as events from 'events';
import * as readline from 'readline';

// https://codingbeautydev.com/blog/javascript-dirname-is-not-defined-in-es-module-scope/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function asyncForEach(array, cb) {
  for (const e of array) {
    await cb(e);
  }
}

/** 当前 node 项目的根目录 */
export function fromRootPath(...paths) {
  return path.join(__dirname, '../..', ...paths);
}

export function fileSHA256(filepath) {
  // https://gist.github.com/GuillermoPena/9233069#gistcomment-3149231-permalink
  const file = fs.readFileSync(filepath);
  const hash = crypto.createHash('sha256');
  hash.update(file);

  return hash.digest('hex');
}

export function existFile(filepath) {
  return fs.existsSync(filepath);
}

export function copyFile(source, target, override) {
  if (existFile(target) && override !== true) {
    return;
  }

  assureParentDirCreated(target);

  fs.copyFileSync(source, target);
}

export function readJSONFromFile(filepath, defaultValue = {}) {
  if (!existFile(filepath)) {
    return defaultValue;
  }

  return JSON.parse(readFile(filepath));
}

export function readFile(filepath, defaultValue = null) {
  if (!existFile(filepath)) {
    return defaultValue;
  }

  return fs.readFileSync(filepath, 'utf8');
}

/** @param {String|Buffer} content  */
export function writeFile(filepath, content) {
  assureParentDirCreated(filepath);

  fs.writeFileSync(filepath, content);
}

export function writeJSONToFile(filepath, value) {
  writeFile(filepath, JSON.stringify(value));
}

export async function fetchAndWriteFile(url, filepath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  writeFile(filepath, buffer);
}

export function readAllFiles(dir) {
  return getAllFiles(dir).map((file) => readFile(file));
}

/** 递归获取指定目录内的全部文件，返回文件绝对路径 */
export function getAllFiles(dir) {
  if (Array.isArray(dir)) {
    return dir.map(getAllFiles).reduce((acc, files) => acc.concat(files), []);
  }

  if (fs.lstatSync(dir).isFile()) {
    return [dir];
  }

  let files = [];
  fs.readdirSync(dir).forEach((file) => {
    const filepath = path.join(dir, file);

    if (fs.lstatSync(filepath).isDirectory()) {
      files = files.concat(getAllFiles(filepath));
    } else {
      files.push(filepath);
    }
  });

  return files;
}

export async function readLineFromFile(filepath, consumer) {
  if (!existFile(filepath)) {
    return [];
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(filepath),
    crlfDelay: Infinity
  });

  const results = [];
  rl.on('line', (line) => {
    const result = consumer(line);
    if (typeof result !== 'undefined') {
      results.push(result);
    }
  });

  await events.once(rl, 'close');

  return results;
}

export function appendLineToFile(filepath, line, doEmpty) {
  assureParentDirCreated(filepath);

  if (!fs.existsSync(filepath) || doEmpty) {
    fs.writeFileSync(filepath, '');
  }

  let fd;
  try {
    fd = fs.openSync(filepath, 'a');
    fs.appendFileSync(fd, line + '\n', 'utf8');
  } finally {
    fd && fs.closeSync(fd);
  }
}

export function assureParentDirCreated(filepath) {
  const dirpath = path.dirname(filepath);

  if (!fs.existsSync(dirpath)) {
    fs.mkdirSync(dirpath, { recursive: true });
  }
}
